# Pricing rework + Pickleball + shared credits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Pickleball (4 courts) as a second bookable sport alongside the
existing football Turf, under a revised member/non-member pricing model
(with a weekday/weekend split on the non-member night rate), with both
sports drawing from the same Team wallet/credit pool.

**Architecture:** Supabase Postgres migrations add a `sport` dimension to
`turf_resources`, update `membership_plans`' rate columns, and update the
two pricing RPCs (`fn_confirm_booking`, `fn_confirm_multi_slot_booking`) to
resolve the non-member night rate by day-of-week. The mobile client (Expo
Router + React Native) gains a sport-aware resource-listing API, a new
Sport/Court selection step in both the member and admin booking flows, and
updated rate displays on every membership-plan screen.

**Tech Stack:** Supabase Postgres (plpgsql RPCs, RLS), Supabase MCP tools
for migrations, React Native + Expo Router, TanStack Query, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-10-pricing-pickleball-shared-credits-design.md`

## Global Constraints

- Never hardcode a specific turf/court as "the" resource — every query must
  go through the new sport-aware resource list, since there are now 5
  `turf_resources` rows (1 Turf + 4 Pickleball courts), not 1.
- The ₹10,000 plan's 3-hour/rolling-24h discount cap logic is unchanged —
  only what the *standard* (non-member) night rate resolves to changes
  (weekday vs weekend), per the spec.
- Apply migrations via `mcp__supabase__apply_migration`, then immediately
  call `mcp__supabase__list_migrations` and rename the local migration file
  to match the timestamp version Supabase actually recorded (this project's
  established convention — MCP assigns its own timestamp, not the local
  filename's).
- Run `npm run typecheck` and `npm run lint` from `mobile/` after every
  client-side task — both must pass clean before moving to the next task.
- Every credit-affecting path change must keep producing exactly one
  `wallet_ledger` row per booking — do not change that convention.

---

### Task 1: Schema migration — sport dimension, rate columns, Pickleball seed

**Files:**
- Create: `supabase/migrations/20260910000000_pickleball_and_pricing_rework.sql` (filename gets renamed after `apply_migration` per Global Constraints)

**Interfaces:**
- Produces: `public.sport_type` enum (`'TURF'`, `'PICKLEBALL'`); `turf_resources.sport` column; `membership_plans.standard_night_weekday_rate_per_hour` (renamed from `standard_night_rate_per_hour`) and `membership_plans.standard_night_weekend_rate_per_hour` (new) columns; 4 new `turf_resources` rows named `'Pickleball Court 1'`..`'Pickleball Court 4'` each with 60 days of hourly `turf_slots`.

- [ ] **Step 1: Write the migration SQL**

```sql
-- Pickleball as a second sport + revised member/non-member pricing model,
-- per docs/superpowers/specs/2026-09-10-pricing-pickleball-shared-credits-design.md.
-- Credits remain shared across both sports (one team_wallets row per Team,
-- unchanged) — this migration only adds a sport dimension to resources and
-- reworks the rate columns; no wallet/credits schema change is needed.

-- 1. Sport dimension on turf_resources ---------------------------------
create type public.sport_type as enum ('TURF', 'PICKLEBALL');

alter table public.turf_resources
  add column sport public.sport_type not null default 'TURF';

alter table public.turf_resources
  alter column sport drop default;

-- 2. membership_plans: new rate values + weekday/weekend split ---------
alter table public.membership_plans
  rename column standard_night_rate_per_hour to standard_night_weekday_rate_per_hour;

alter table public.membership_plans
  add column standard_night_weekend_rate_per_hour integer;

update public.membership_plans set
  membership_day_rate_per_hour = 350,
  membership_night_rate_per_hour = 650,
  standard_day_rate_per_hour = 400,
  standard_night_weekday_rate_per_hour = 700,
  standard_night_weekend_rate_per_hour = 800;

alter table public.membership_plans
  alter column standard_night_weekend_rate_per_hour set not null,
  add constraint chk_membership_plans_weekend_rate_positive
    check (standard_night_weekend_rate_per_hour > 0);

-- 3. Seed 4 Pickleball courts + 60 days of hourly slots -----------------
-- Same pattern as the existing Turf seed in
-- supabase/migrations/20260905044245_join_flow_and_lookups.sql.
do $$
declare
  v_court_name text;
  v_court_id uuid;
  v_day date;
  v_hour int;
begin
  for v_court_name in
    select unnest(array[
      'Pickleball Court 1', 'Pickleball Court 2',
      'Pickleball Court 3', 'Pickleball Court 4'
    ])
  loop
    select id into v_court_id from public.turf_resources where name = v_court_name;
    if v_court_id is null then
      insert into public.turf_resources (name, description, sport)
      values (v_court_name, 'Thrill Mill Arena — outdoor pickleball court', 'PICKLEBALL')
      returning id into v_court_id;
    end if;

    for v_day in
      select generate_series(current_date, current_date + interval '59 days', interval '1 day')::date
    loop
      for v_hour in 5..23 loop
        insert into public.turf_slots (turf_id, slot_date, start_time, end_time, status)
        values (v_court_id, v_day, make_time(v_hour, 0, 0), make_time(v_hour + 1, 0, 0), 'AVAILABLE')
        on conflict (turf_id, slot_date, start_time) do nothing;
      end loop;
    end loop;
  end loop;
end $$;

-- 4. Backfill the existing Turf row's sport (belt-and-suspenders — the
--    column default already set this, but be explicit for anyone reading
--    the migration in isolation).
update public.turf_resources set sport = 'TURF' where name = 'Thrill Mill Turf';
```

- [ ] **Step 2: Apply the migration**

Use `mcp__supabase__apply_migration` with `name: "pickleball_and_pricing_rework"` and the SQL above as `query`.

- [ ] **Step 3: Reconcile the local migration filename**

Call `mcp__supabase__list_migrations`, find the version Supabase actually recorded for this migration, and rename the local file from `20260910000000_pickleball_and_pricing_rework.sql` to `<recorded_version>_pickleball_and_pricing_rework.sql`.

- [ ] **Step 4: Verify via SQL**

Run via `mcp__supabase__execute_sql`:

```sql
select name, sport from public.turf_resources order by sport, name;
```

Expected: 1 row with `sport = 'TURF'` (name `'Thrill Mill Turf'`), 4 rows with `sport = 'PICKLEBALL'` (Court 1–4).

```sql
select code, membership_day_rate_per_hour, membership_night_rate_per_hour,
       standard_day_rate_per_hour, standard_night_weekday_rate_per_hour,
       standard_night_weekend_rate_per_hour, discounted_hours_cap_per_24h
from public.membership_plans order by code;
```

Expected: both plans show `350 / 650 / 400 / 700 / 800`; `PLAN_10K` has `discounted_hours_cap_per_24h = 3`, `PLAN_25K` has `null`.

```sql
select turf_id, count(*) from public.turf_slots
where turf_id in (select id from public.turf_resources where sport = 'PICKLEBALL')
group by turf_id;
```

Expected: 4 rows, each with `count = 1140` (60 days × 19 hourly slots).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "Add Pickleball sport dimension + revised member/non-member pricing

sport_type enum + turf_resources.sport column; seed 4 Pickleball courts
with 60 days of hourly slots. membership_plans rates updated to the new
member/non-member model; standard_night_rate_per_hour renamed to
standard_night_weekday_rate_per_hour, new
standard_night_weekend_rate_per_hour column added. Pricing RPC logic
updated in a follow-up commit."
```

---

### Task 2: Pricing RPC — weekday/weekend-aware standard night rate

**Files:**
- Create: `supabase/migrations/20260910000100_weekday_weekend_pricing_rpcs.sql` (filename gets renamed after `apply_migration`)

**Interfaces:**
- Consumes: `membership_plans.standard_night_weekday_rate_per_hour`, `membership_plans.standard_night_weekend_rate_per_hour` (Task 1)
- Produces: updated `public.fn_confirm_booking(uuid, uuid[])` and `public.fn_confirm_multi_slot_booking(uuid[], uuid[])` — same signatures, same return types, callers unchanged.

- [ ] **Step 1: Write the migration SQL**

Both functions gain the same change: resolve `v_is_weekend` once (or per-slot for the multi-slot function, since slots can span different iterations of the loop but are constrained same-day so it's really once per call), then branch the standard/night credit line on it. Saturday/Sunday = ISO day-of-week 6/7.

```sql
-- Weekday/weekend-aware standard (non-member) night rate, per
-- docs/superpowers/specs/2026-09-10-pricing-pickleball-shared-credits-design.md.
-- The membership (member) rate and both day rates are unaffected — only the
-- standard/night credit line now branches on day-of-week.

create or replace function public.fn_confirm_booking(
  p_hold_id uuid,
  p_participant_user_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold public.slot_holds%rowtype;
  v_slot public.turf_slots%rowtype;
  v_membership public.team_memberships%rowtype;
  v_plan public.membership_plans%rowtype;
  v_wallet public.team_wallets%rowtype;
  v_duration_hours integer;
  v_session_start timestamptz;
  v_discounted_used_in_window integer;
  v_discount_remaining integer;
  v_hour_offset integer;
  v_slice_start time;
  v_is_day boolean;
  v_is_weekend boolean;
  v_standard_night_rate integer;
  v_membership_day_hours integer := 0;
  v_membership_night_hours integer := 0;
  v_standard_day_hours integer := 0;
  v_standard_night_hours integer := 0;
  v_total_credits numeric(12,2) := 0;
  v_new_balance numeric(12,2);
  v_booking_id uuid;
  v_participant uuid;
begin
  if p_participant_user_ids is null or array_length(p_participant_user_ids, 1) is null then
    raise exception 'NO_PARTICIPANTS' using errcode = '22023';
  end if;

  select * into v_hold from public.slot_holds where id = p_hold_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (public.fn_is_team_host_or_cohost(v_hold.team_id) or public.fn_is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_hold.status <> 'ACTIVE' or v_hold.expires_at < now() then
    if v_hold.status = 'ACTIVE' then
      update public.slot_holds set status = 'EXPIRED' where id = p_hold_id;
      update public.turf_slots set status = 'AVAILABLE' where id = v_hold.slot_id;
    end if;
    raise exception 'HOLD_EXPIRED' using errcode = '22023';
  end if;

  select * into v_slot from public.turf_slots where id = v_hold.slot_id for update;
  if not found or v_slot.status <> 'HELD' then
    raise exception 'SLOT_UNAVAILABLE' using errcode = '22023';
  end if;

  select * into v_membership from public.team_memberships
    where team_id = v_hold.team_id and status = 'ACTIVE';
  if not found then
    raise exception 'MEMBERSHIP_INACTIVE' using errcode = '22023';
  end if;

  select * into v_plan from public.membership_plans where id = v_membership.plan_id;

  for v_participant in select unnest(p_participant_user_ids) loop
    if not exists (
      select 1 from public.team_members
      where team_id = v_hold.team_id and user_id = v_participant and status = 'ACTIVE'
    ) then
      raise exception 'PARTICIPANT_INVALID' using errcode = '22023';
    end if;
  end loop;

  v_duration_hours := round(extract(epoch from (v_slot.end_time - v_slot.start_time)) / 3600.0)::integer;
  v_session_start := (v_slot.slot_date + v_slot.start_time) at time zone 'Asia/Kolkata';
  v_is_weekend := extract(isodow from v_slot.slot_date) in (6, 7);
  v_standard_night_rate := case when v_is_weekend
    then v_plan.standard_night_weekend_rate_per_hour
    else v_plan.standard_night_weekday_rate_per_hour
  end;

  if v_plan.discounted_hours_cap_per_24h is null then
    v_discount_remaining := v_duration_hours;
  else
    select coalesce(sum(b.membership_day_hours + b.membership_night_hours), 0)
      into v_discounted_used_in_window
      from public.bookings b
      where b.team_id = v_hold.team_id
        and b.status in ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
        and ((b.booking_date + b.start_time) at time zone 'Asia/Kolkata') >= v_session_start - interval '24 hours'
        and ((b.booking_date + b.start_time) at time zone 'Asia/Kolkata') < v_session_start;

    v_discount_remaining := greatest(v_plan.discounted_hours_cap_per_24h - v_discounted_used_in_window, 0);
  end if;

  for v_hour_offset in 0 .. (v_duration_hours - 1) loop
    v_slice_start := v_slot.start_time + (v_hour_offset || ' hours')::interval;
    v_is_day := v_slice_start >= time '05:00:00' and v_slice_start < time '17:00:00';

    if v_hour_offset < v_discount_remaining then
      if v_is_day then
        v_membership_day_hours := v_membership_day_hours + 1;
        v_total_credits := v_total_credits + v_plan.membership_day_rate_per_hour;
      else
        v_membership_night_hours := v_membership_night_hours + 1;
        v_total_credits := v_total_credits + v_plan.membership_night_rate_per_hour;
      end if;
    else
      if v_is_day then
        v_standard_day_hours := v_standard_day_hours + 1;
        v_total_credits := v_total_credits + v_plan.standard_day_rate_per_hour;
      else
        v_standard_night_hours := v_standard_night_hours + 1;
        v_total_credits := v_total_credits + v_standard_night_rate;
      end if;
    end if;
  end loop;

  select * into v_wallet from public.team_wallets where team_id = v_hold.team_id for update;
  if v_wallet.available_credits < v_total_credits then
    raise exception 'INSUFFICIENT_CREDITS' using errcode = '22023';
  end if;

  v_new_balance := v_wallet.available_credits - v_total_credits;
  update public.team_wallets set available_credits = v_new_balance where team_id = v_hold.team_id;

  insert into public.bookings
    (team_id, turf_id, slot_id, hold_id, status, booking_date, start_time, end_time,
     duration_hours, membership_day_hours, membership_night_hours,
     standard_day_hours, standard_night_hours,
     membership_day_rate_applied, membership_night_rate_applied,
     standard_day_rate_applied, standard_night_rate_applied,
     total_credits, created_by, confirmed_at)
  values
    (v_hold.team_id, v_slot.turf_id, v_slot.id, v_hold.id, 'CONFIRMED', v_slot.slot_date,
     v_slot.start_time, v_slot.end_time, v_duration_hours,
     v_membership_day_hours, v_membership_night_hours, v_standard_day_hours, v_standard_night_hours,
     v_plan.membership_day_rate_per_hour, v_plan.membership_night_rate_per_hour,
     v_plan.standard_day_rate_per_hour, v_standard_night_rate,
     v_total_credits, auth.uid(), now())
  returning id into v_booking_id;

  insert into public.wallet_ledger
    (team_id, entry_type, amount, balance_after, reference_type, reference_id, created_by, reason)
  values
    (v_hold.team_id, 'BOOKING_CONSUME', -v_total_credits, v_new_balance,
     'booking', v_booking_id, auth.uid(), 'Booking confirmed');

  insert into public.booking_participants (booking_id, user_id, added_by)
  select v_booking_id, unnest(p_participant_user_ids), auth.uid();

  update public.slot_holds set status = 'CONVERTED' where id = v_hold.id;
  update public.turf_slots set status = 'CONFIRMED' where id = v_slot.id;

  return v_booking_id;
end;
$$;

create or replace function public.fn_confirm_multi_slot_booking(
  p_hold_ids uuid[],
  p_participant_user_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_hold public.slot_holds%rowtype;
  v_slot public.turf_slots%rowtype;
  v_membership public.team_memberships%rowtype;
  v_plan public.membership_plans%rowtype;
  v_wallet public.team_wallets%rowtype;
  v_participant uuid;
  v_hold_id uuid;
  v_slot_id uuid;
  v_slot_date date;
  v_earliest_session_start timestamptz;
  v_is_weekend boolean;
  v_standard_night_rate integer;
  v_discount_remaining integer;
  v_discounted_used_in_window integer;
  v_total_credits numeric(12,2) := 0;
  v_new_balance numeric(12,2);
  v_booking_ids uuid[] := '{}';
  v_booking_id uuid;
  v_hour_offset integer;
  v_slice_start time;
  v_is_day boolean;
  v_membership_day_hours integer;
  v_membership_night_hours integer;
  v_standard_day_hours integer;
  v_standard_night_hours integer;
  v_slot_credits numeric(12,2);
  v_slot_duration_hours integer;
  v_slot_ids uuid[];
begin
  if p_hold_ids is null or array_length(p_hold_ids, 1) is null then
    raise exception 'NO_SLOTS_SELECTED' using errcode = '22023';
  end if;
  if p_participant_user_ids is null or array_length(p_participant_user_ids, 1) is null then
    raise exception 'NO_PARTICIPANTS' using errcode = '22023';
  end if;

  for v_hold_id in select unnest(p_hold_ids) order by 1 loop
    select * into v_hold from public.slot_holds where id = v_hold_id for update;
    if not found then
      raise exception 'NOT_FOUND' using errcode = 'P0002';
    end if;

    if v_team_id is null then
      v_team_id := v_hold.team_id;
    elsif v_hold.team_id <> v_team_id then
      raise exception 'SLOTS_MUST_BE_SAME_TEAM' using errcode = '22023';
    end if;

    if v_hold.status <> 'ACTIVE' or v_hold.expires_at < now() then
      if v_hold.status = 'ACTIVE' then
        update public.slot_holds set status = 'EXPIRED' where id = v_hold.id;
        update public.turf_slots set status = 'AVAILABLE' where id = v_hold.slot_id;
      end if;
      raise exception 'HOLD_EXPIRED' using errcode = '22023';
    end if;
  end loop;

  if not (public.fn_is_team_host_or_cohost(v_team_id) or public.fn_is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_membership from public.team_memberships
    where team_id = v_team_id and status = 'ACTIVE';
  if not found then
    raise exception 'MEMBERSHIP_INACTIVE' using errcode = '22023';
  end if;
  select * into v_plan from public.membership_plans where id = v_membership.plan_id;

  for v_participant in select unnest(p_participant_user_ids) loop
    if not exists (
      select 1 from public.team_members
      where team_id = v_team_id and user_id = v_participant and status = 'ACTIVE'
    ) then
      raise exception 'PARTICIPANT_INVALID' using errcode = '22023';
    end if;
  end loop;

  select array_agg(ts.id order by ts.start_time)
    into v_slot_ids
    from public.turf_slots ts
    join public.slot_holds sh on sh.slot_id = ts.id
    where sh.id = any(p_hold_ids);

  for v_slot_id in select unnest(v_slot_ids) loop
    select * into v_slot from public.turf_slots where id = v_slot_id for update;
    if not found or v_slot.status <> 'HELD' then
      raise exception 'SLOT_UNAVAILABLE' using errcode = '22023';
    end if;
    if v_slot_date is null then
      v_slot_date := v_slot.slot_date;
    elsif v_slot.slot_date <> v_slot_date then
      raise exception 'SLOTS_MUST_BE_SAME_DAY' using errcode = '22023';
    end if;
  end loop;

  -- All slots are same-day (enforced above), so weekday/weekend is a single
  -- value for the whole batch.
  v_is_weekend := extract(isodow from v_slot_date) in (6, 7);
  v_standard_night_rate := case when v_is_weekend
    then v_plan.standard_night_weekend_rate_per_hour
    else v_plan.standard_night_weekday_rate_per_hour
  end;

  v_earliest_session_start := (
    select min((ts.slot_date + ts.start_time) at time zone 'Asia/Kolkata')
    from public.turf_slots ts where ts.id = any(v_slot_ids)
  );

  if v_plan.discounted_hours_cap_per_24h is null then
    v_discount_remaining := 2147483647;
  else
    select coalesce(sum(b.membership_day_hours + b.membership_night_hours), 0)
      into v_discounted_used_in_window
      from public.bookings b
      where b.team_id = v_team_id
        and b.status in ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
        and ((b.booking_date + b.start_time) at time zone 'Asia/Kolkata') >= v_earliest_session_start - interval '24 hours'
        and ((b.booking_date + b.start_time) at time zone 'Asia/Kolkata') < v_earliest_session_start;
    v_discount_remaining := greatest(v_plan.discounted_hours_cap_per_24h - v_discounted_used_in_window, 0);
  end if;

  for v_slot_id in select unnest(v_slot_ids) loop
    select * into v_slot from public.turf_slots where id = v_slot_id;
    v_slot_duration_hours := round(extract(epoch from (v_slot.end_time - v_slot.start_time)) / 3600.0)::integer;
    for v_hour_offset in 0 .. (v_slot_duration_hours - 1) loop
      v_slice_start := v_slot.start_time + (v_hour_offset || ' hours')::interval;
      v_is_day := v_slice_start >= time '05:00:00' and v_slice_start < time '17:00:00';
      if v_discount_remaining > 0 then
        v_discount_remaining := v_discount_remaining - 1;
        v_total_credits := v_total_credits + (case when v_is_day then v_plan.membership_day_rate_per_hour else v_plan.membership_night_rate_per_hour end);
      else
        v_total_credits := v_total_credits + (case when v_is_day then v_plan.standard_day_rate_per_hour else v_standard_night_rate end);
      end if;
    end loop;
  end loop;

  select * into v_wallet from public.team_wallets where team_id = v_team_id for update;
  if v_wallet.available_credits < v_total_credits then
    raise exception 'INSUFFICIENT_CREDITS' using errcode = '22023';
  end if;

  if v_plan.discounted_hours_cap_per_24h is null then
    v_discount_remaining := 2147483647;
  else
    v_discount_remaining := greatest(v_plan.discounted_hours_cap_per_24h - v_discounted_used_in_window, 0);
  end if;

  for v_slot_id in select unnest(v_slot_ids) loop
    select * into v_slot from public.turf_slots where id = v_slot_id;
    v_slot_duration_hours := round(extract(epoch from (v_slot.end_time - v_slot.start_time)) / 3600.0)::integer;
    v_membership_day_hours := 0; v_membership_night_hours := 0;
    v_standard_day_hours := 0; v_standard_night_hours := 0;
    v_slot_credits := 0;

    for v_hour_offset in 0 .. (v_slot_duration_hours - 1) loop
      v_slice_start := v_slot.start_time + (v_hour_offset || ' hours')::interval;
      v_is_day := v_slice_start >= time '05:00:00' and v_slice_start < time '17:00:00';
      if v_discount_remaining > 0 then
        v_discount_remaining := v_discount_remaining - 1;
        if v_is_day then
          v_membership_day_hours := v_membership_day_hours + 1;
          v_slot_credits := v_slot_credits + v_plan.membership_day_rate_per_hour;
        else
          v_membership_night_hours := v_membership_night_hours + 1;
          v_slot_credits := v_slot_credits + v_plan.membership_night_rate_per_hour;
        end if;
      else
        if v_is_day then
          v_standard_day_hours := v_standard_day_hours + 1;
          v_slot_credits := v_slot_credits + v_plan.standard_day_rate_per_hour;
        else
          v_standard_night_hours := v_standard_night_hours + 1;
          v_slot_credits := v_slot_credits + v_standard_night_rate;
        end if;
      end if;
    end loop;

    v_new_balance := v_wallet.available_credits - v_slot_credits;
    update public.team_wallets set available_credits = v_new_balance where team_id = v_team_id;
    v_wallet.available_credits := v_new_balance;

    insert into public.bookings
      (team_id, turf_id, slot_id, hold_id, status, booking_date, start_time, end_time,
       duration_hours, membership_day_hours, membership_night_hours,
       standard_day_hours, standard_night_hours,
       membership_day_rate_applied, membership_night_rate_applied,
       standard_day_rate_applied, standard_night_rate_applied,
       total_credits, created_by, confirmed_at)
    values
      (v_team_id, v_slot.turf_id, v_slot.id,
       (select id from public.slot_holds where slot_id = v_slot.id and id = any(p_hold_ids) limit 1),
       'CONFIRMED', v_slot.slot_date, v_slot.start_time, v_slot.end_time, v_slot_duration_hours,
       v_membership_day_hours, v_membership_night_hours, v_standard_day_hours, v_standard_night_hours,
       v_plan.membership_day_rate_per_hour, v_plan.membership_night_rate_per_hour,
       v_plan.standard_day_rate_per_hour, v_standard_night_rate,
       v_slot_credits, auth.uid(), now())
    returning id into v_booking_id;

    insert into public.wallet_ledger
      (team_id, entry_type, amount, balance_after, reference_type, reference_id, created_by, reason)
    values
      (v_team_id, 'BOOKING_CONSUME', -v_slot_credits, v_new_balance, 'booking', v_booking_id, auth.uid(), 'Booking confirmed (multi-slot)');

    insert into public.booking_participants (booking_id, user_id, added_by)
    select v_booking_id, unnest(p_participant_user_ids), auth.uid();

    update public.slot_holds set status = 'CONVERTED'
      where slot_id = v_slot.id and id = any(p_hold_ids);
    update public.turf_slots set status = 'CONFIRMED' where id = v_slot.id;

    v_booking_ids := v_booking_ids || v_booking_id;
  end loop;

  return v_booking_ids;
end;
$$;
```

- [ ] **Step 2: Apply the migration**

Use `mcp__supabase__apply_migration` with `name: "weekday_weekend_pricing_rpcs"` and the SQL above.

- [ ] **Step 3: Reconcile the local migration filename**

Same as Task 1 Step 3 — `list_migrations`, rename local file to match recorded version.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/
git commit -m "Weekday/weekend-aware standard night rate in booking RPCs

fn_confirm_booking and fn_confirm_multi_slot_booking now resolve the
standard (non-member) night rate from standard_night_weekday_rate_per_hour
or standard_night_weekend_rate_per_hour based on the booking's actual
slot_date (ISO day-of-week 6/7 = weekend). Membership rate, day rate, and
the discount-cap logic are unchanged."
```

---

### Task 3: Verify pricing correctness with rollback-wrapped scenario checks

**Files:** none created — verification only, via `mcp__supabase__execute_sql`.

**Interfaces:**
- Consumes: `fn_confirm_multi_slot_booking` (Task 2), an existing ACTIVE Team + membership fixture from the live DB (read-only lookup, no fixture creation needed — use one of the 7 existing Teams).

This task proves the financial logic is correct per CLAUDE.md's Testing Requirements, without a pgTAP framework (not yet set up in this project) and without leaving any residue in the real database — every check runs inside a transaction that ends in `rollback`.

- [ ] **Step 1: Find a real ACTIVE-membership Team to test against**

```sql
select tm.team_id, tm.plan_id, mp.code, mp.discounted_hours_cap_per_24h
from public.team_memberships tm
join public.membership_plans mp on mp.id = tm.plan_id
where tm.status = 'ACTIVE'
limit 5;
```

Pick one `PLAN_10K` team (has the cap) and one `PLAN_25K` team (no cap) from the results — call their ids `<team_10k>` and `<team_25k>` below.

- [ ] **Step 2: Verify weekday vs weekend standard-night pricing**

Run (adjust `<team_25k>` to an id from Step 1 — using the uncapped plan isolates the standard-rate math from the discount-cap logic):

```sql
begin;

-- Find a Pickleball court and two future slots: one on a weekday night,
-- one on a weekend night, both currently AVAILABLE.
do $$
declare
  v_court_id uuid;
  v_weekday_slot uuid;
  v_weekend_slot uuid;
  v_hold_weekday uuid;
  v_hold_weekend uuid;
  v_booking_weekday uuid[];
  v_booking_weekend uuid[];
  v_credits_weekday numeric;
  v_credits_weekend numeric;
begin
  select id into v_court_id from public.turf_resources where sport = 'PICKLEBALL' limit 1;

  select id into v_weekday_slot from public.turf_slots
  where turf_id = v_court_id and status = 'AVAILABLE'
    and start_time = '19:00:00' and extract(isodow from slot_date) not in (6,7)
  order by slot_date limit 1;

  select id into v_weekend_slot from public.turf_slots
  where turf_id = v_court_id and status = 'AVAILABLE'
    and start_time = '19:00:00' and extract(isodow from slot_date) in (6,7)
  order by slot_date limit 1;

  insert into public.slot_holds (slot_id, team_id, status, expires_at)
  values (v_weekday_slot, '<team_25k>', 'ACTIVE', now() + interval '1 minute')
  returning id into v_hold_weekday;
  update public.turf_slots set status = 'HELD' where id = v_weekday_slot;

  insert into public.slot_holds (slot_id, team_id, status, expires_at)
  values (v_weekend_slot, '<team_25k>', 'ACTIVE', now() + interval '1 minute')
  returning id into v_hold_weekend;
  update public.turf_slots set status = 'HELD' where id = v_weekend_slot;

  v_booking_weekday := public.fn_confirm_multi_slot_booking(
    array[v_hold_weekday],
    array[(select user_id from public.team_members where team_id = '<team_25k>' and status = 'ACTIVE' limit 1)]
  );
  v_booking_weekend := public.fn_confirm_multi_slot_booking(
    array[v_hold_weekend],
    array[(select user_id from public.team_members where team_id = '<team_25k>' and status = 'ACTIVE' limit 1)]
  );

  select total_credits into v_credits_weekday from public.bookings where id = v_booking_weekday[1];
  select total_credits into v_credits_weekend from public.bookings where id = v_booking_weekend[1];

  raise notice 'weekday_credits=% weekend_credits=%', v_credits_weekday, v_credits_weekend;

  if v_credits_weekday <> 700 then
    raise exception 'FAIL: expected weekday standard-night rate 700, got %', v_credits_weekday;
  end if;
  if v_credits_weekend <> 800 then
    raise exception 'FAIL: expected weekend standard-night rate 800, got %', v_credits_weekend;
  end if;

  raise notice 'PASS: weekday=700, weekend=800, Pickleball court priced correctly';
end $$;

rollback;
```

Expected: a `NOTICE` reading `PASS: weekday=700, weekend=800, Pickleball court priced correctly`, and the transaction rolls back (nothing persists — re-run `select available_credits from team_wallets where team_id = '<team_25k>'` afterward and confirm it matches its pre-test value).

- [ ] **Step 3: Verify the ₹10,000 plan's cap still works correctly with the new rates**

Run the same pattern against `<team_10k>`: book 4 consecutive day-band hours (cap is 3) and confirm the 4th hour's contribution to `total_credits` is `400` (standard day rate) not `350` (membership day rate) — i.e. `total_credits = 350*3 + 400*1 = 1450`. Wrap in `begin; ... rollback;` exactly as Step 2.

- [ ] **Step 4: Verify cross-sport shared wallet**

Confirm a Turf booking and a Pickleball booking for the same Team both debit the same `team_wallets` row — query `available_credits` before, run one hold+confirm against the Turf resource and one against a Pickleball court (both wrapped in the same `begin ... rollback` transaction), and assert both debits applied to the same team_id's wallet in sequence (the second booking's expected pre-debit balance equals the wallet balance after the first).

No commit for this task — it's verification only, nothing is created in the repo.

---

### Task 4: Client types + sport-aware resource API

**Files:**
- Modify: `mobile/src/types/db.ts:99-103` (TurfResource), `mobile/src/types/db.ts:55-67` (MembershipPlan)
- Modify: `mobile/src/features/booking/api.ts:26-36` (replace `getDefaultTurf`)
- Modify: `mobile/src/features/booking/useBooking.ts:1-15` (replace `useDefaultTurf`)

**Interfaces:**
- Produces: `TurfResource.sport: 'TURF' | 'PICKLEBALL'`; `MembershipPlan.standard_night_weekday_rate_per_hour` / `standard_night_weekend_rate_per_hour` (replacing `standard_night_rate_per_hour`); `getTurfResources(): Promise<TurfResource[]>` in `api.ts`; `useTurfResources()` in `useBooking.ts`.
- Consumes: nothing new (pure type/API layer change).

- [ ] **Step 1: Update `TurfResource` and `MembershipPlan` types**

In `mobile/src/types/db.ts`, replace:

```ts
export type TurfResource = {
  id: string;
  name: string;
  description: string | null;
};
```

with:

```ts
export type Sport = 'TURF' | 'PICKLEBALL';

export type TurfResource = {
  id: string;
  name: string;
  description: string | null;
  sport: Sport;
};
```

And replace the `MembershipPlan` rate fields:

```ts
  standard_day_rate_per_hour: number;
  standard_night_rate_per_hour: number;
```

with:

```ts
  standard_day_rate_per_hour: number;
  standard_night_weekday_rate_per_hour: number;
  standard_night_weekend_rate_per_hour: number;
```

- [ ] **Step 2: Replace `getDefaultTurf` with `getTurfResources`**

In `mobile/src/features/booking/api.ts`, replace the `getDefaultTurf` function:

```ts
export async function getTurfResources(): Promise<TurfResource[]> {
  const { data, error } = await supabase
    .from('turf_resources')
    .select('*')
    .eq('is_active', true)
    .order('sport', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return data as TurfResource[];
}
```

- [ ] **Step 3: Replace `useDefaultTurf` with `useTurfResources`**

In `mobile/src/features/booking/useBooking.ts`, update the import (`getDefaultTurf` → `getTurfResources`) and replace:

```ts
export function useDefaultTurf() {
  return useQuery({ queryKey: ['default-turf'], queryFn: getDefaultTurf, staleTime: 60 * 60 * 1000 });
}
```

with:

```ts
export function useTurfResources() {
  return useQuery({ queryKey: ['turf-resources'], queryFn: getTurfResources, staleTime: 60 * 60 * 1000 });
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck` from `mobile/`.
Expected: errors in `BookTurfScreen.tsx` and `SelectSlotScreen.tsx` (still importing/using `useDefaultTurf`, and referencing the old `standard_night_rate_per_hour` field) — fixed in Tasks 5 and 6 — plus `ChooseMembershipScreen.tsx` (also references `standard_night_rate_per_hour`, per the grep in this plan's grounding) — fixed in Task 7. Confirm the errors are *only* in these three files, not anywhere else.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/types/db.ts mobile/src/features/booking/api.ts mobile/src/features/booking/useBooking.ts
git commit -m "Add sport-aware turf resource listing, update rate field types

getDefaultTurf/useDefaultTurf replaced with getTurfResources/
useTurfResources, returning every active resource (Turf + 4 Pickleball
courts) instead of assuming exactly one exists. MembershipPlan gains
standard_night_weekday_rate_per_hour/standard_night_weekend_rate_per_hour
in place of the old single standard_night_rate_per_hour field.

Downstream callers (BookTurfScreen, SelectSlotScreen) updated in
follow-up commits — typecheck currently fails there by design."
```

---

### Task 5: Member booking flow — Sport/Court selection + weekday-aware preview

**Files:**
- Modify: `mobile/src/features/booking/screens/BookTurfScreen.tsx`

**Interfaces:**
- Consumes: `useTurfResources()`, `TurfResource.sport` (Task 4)
- Produces: no new exports — internal screen state only.

- [ ] **Step 1: Add sport/resource selection state and derive the active resource**

Replace the `useDefaultTurf` import and usage (`const { data: turf } = useDefaultTurf();`) with:

```ts
import { useTurfResources } from '../useBooking';
// ... remove useDefaultTurf from the import list
```

```ts
const { data: turfResources } = useTurfResources();
const [selectedSport, setSelectedSport] = useState<'TURF' | 'PICKLEBALL'>('TURF');
const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

const resourcesForSport = useMemo(
  () => (turfResources ?? []).filter((r) => r.sport === selectedSport),
  [turfResources, selectedSport]
);
// Turf only ever has one resource — auto-select it so the flow feels
// unchanged from before Pickleball existed. Pickleball has 4, so the user
// picks explicitly (selectedResourceId stays null until they do).
const turf = selectedSport === 'TURF'
  ? resourcesForSport[0]
  : resourcesForSport.find((r) => r.id === selectedResourceId);

useEffect(() => {
  setSelectedResourceId(null);
}, [selectedSport]);
```

Every other use of `turf?.id` / `turf?.name` in the file (the `useTurfSlots(turf?.id, ...)` call, the `heroCard`/`summaryCard` display, `invalidateBooking({ ..., turfId: turf?.id })`) stays as-is — `turf` now just resolves differently.

- [ ] **Step 2: Add the Sport selector + Court picker UI**

Insert directly after the `teamPill` View and before `heroCard`:

```tsx
<Text style={styles.sectionLabel}>Select Sport</Text>
<View style={styles.sportRow}>
  {(['TURF', 'PICKLEBALL'] as const).map((sport) => (
    <Pressable
      key={sport}
      style={[styles.sportChip, selectedSport === sport && styles.sportChipSelected]}
      onPress={() => setSelectedSport(sport)}
    >
      <Ionicons
        name={sport === 'TURF' ? 'football-outline' : 'tennisball-outline'}
        size={16}
        color={selectedSport === sport ? '#FFFFFF' : colors.text}
      />
      <Text style={[styles.sportChipText, selectedSport === sport && styles.sportChipTextSelected]}>
        {sport === 'TURF' ? 'Turf' : 'Pickleball'}
      </Text>
    </Pressable>
  ))}
</View>

{selectedSport === 'PICKLEBALL' && (
  <>
    <Text style={styles.sectionLabel}>Select Court</Text>
    <View style={styles.sportRow}>
      {resourcesForSport.map((court) => (
        <Pressable
          key={court.id}
          style={[styles.sportChip, selectedResourceId === court.id && styles.sportChipSelected]}
          onPress={() => setSelectedResourceId(court.id)}
        >
          <Text style={[styles.sportChipText, selectedResourceId === court.id && styles.sportChipTextSelected]}>
            {court.name.replace('Pickleball ', '')}
          </Text>
        </Pressable>
      ))}
    </View>
  </>
)}
```

Add matching styles to the `StyleSheet.create` block:

```ts
sportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
sportChip: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.md,
  borderRadius: radii.pill,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: '#FFFFFF',
},
sportChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
sportChipText: { fontSize: 13, fontWeight: '700', color: colors.text },
sportChipTextSelected: { color: '#FFFFFF' },
```

- [ ] **Step 3: Make the slot grid depend on the resolved resource, and reset selection when it changes**

The existing `useTurfSlots(turf?.id, selectedDate)` call already reacts to `turf?.id` changing. Add an effect to clear any held slots when the resource itself changes (switching sport/court mid-selection shouldn't silently keep stale holds against a different resource):

```ts
const turfIdRef = useRef(turf?.id);
useEffect(() => {
  if (turfIdRef.current && turfIdRef.current !== turf?.id && heldSlots.size > 0) {
    const toRelease = Array.from(heldSlots.values());
    setHeldSlots(new Map());
    Promise.all(toRelease.map((h) => releaseSlotHold(h.holdId).catch(() => undefined)));
  }
  turfIdRef.current = turf?.id;
}, [turf?.id]);
```

(`useRef` already imported at the top of the file per its existing `import { useEffect, useMemo, useState } from 'react';` — add `useRef` to that import.)

- [ ] **Step 4: Update `computeBookingPreview` for weekday/weekend-aware standard night rate**

The function currently takes `(sortedSlots: TurfSlot[], plan)`. It needs the booking date to resolve weekday/weekend — pass `selectedDate` in:

```ts
function computeBookingPreview(
  sortedSlots: TurfSlot[],
  plan: MembershipPlan | undefined,
  isoDate: string
): BookingPreview | null {
  if (!plan || sortedSlots.length === 0) return null;

  const isWeekend = [0, 6].includes(new Date(`${isoDate}T00:00:00`).getDay());
  const standardNightRate = isWeekend
    ? plan.standard_night_weekend_rate_per_hour
    : plan.standard_night_weekday_rate_per_hour;

  let discountRemaining = plan.discounted_hours_cap_per_24h ?? Infinity;
  let totalCredits = 0;
  let totalHours = 0;
  const buckets = new Map<string, { hours: number; rate: number }>();

  const addHour = (label: string, rate: number) => {
    const existing = buckets.get(label);
    if (existing) existing.hours += 1;
    else buckets.set(label, { hours: 1, rate });
    totalCredits += rate;
    totalHours += 1;
  };

  for (const slot of sortedSlots) {
    const startHour = parseInt(slot.start_time.split(':')[0], 10);
    const duration = slotDurationHours(slot);
    for (let offset = 0; offset < duration; offset++) {
      const hour = (startHour + offset) % 24;
      const isDay = hour >= 5 && hour < 17;
      if (discountRemaining > 0) {
        discountRemaining -= 1;
        addHour(isDay ? 'Membership Day' : 'Membership Night', isDay ? plan.membership_day_rate_per_hour : plan.membership_night_rate_per_hour);
      } else {
        addHour(isDay ? 'Standard Day' : 'Standard Night', isDay ? plan.standard_day_rate_per_hour : standardNightRate);
      }
    }
  }

  const lines: PreviewLine[] = Array.from(buckets.entries()).map(([label, v]) => ({
    label,
    hours: v.hours,
    rate: v.rate,
    subtotal: v.hours * v.rate,
  }));

  return { totalCredits, totalHours, lines };
}
```

Note: `new Date('YYYY-MM-DDT00:00:00').getDay()` returns 0=Sunday, 6=Saturday in local time — matches the `[0, 6]` check. This mirrors the server's `extract(isodow from slot_date) in (6, 7)` (ISO Mon=1..Sun=7) using JS's own Sun=0..Sat=6 convention — both correctly identify Sat/Sun, just different numbering.

Update the call site:

```ts
const preview = useMemo(
  () => computeBookingPreview(sortedHeldSlots.map((h) => h.slot), plan, selectedDate),
  [sortedHeldSlots, plan, selectedDate]
);
```

- [ ] **Step 5: Typecheck and lint**

Run: `npm run typecheck && npm run lint` from `mobile/`.
Expected: both clean (this file's errors from Task 4 are now resolved; `SelectSlotScreen.tsx` errors remain, fixed in Task 6).

- [ ] **Step 6: Commit**

```bash
git add mobile/src/features/booking/screens/BookTurfScreen.tsx
git commit -m "Add Sport/Court selection to the member Book Turf flow

Turf still auto-selects its single resource (flow unchanged for
football); Pickleball shows a Court 1-4 picker. Booking preview now
resolves the standard night rate by weekday/weekend using the selected
date, matching the server's fn_confirm_multi_slot_booking logic."
```

---

### Task 6: Admin booking flow — mirror the Sport/Court selection

**Files:**
- Modify: `mobile/src/features/admin/screens/booking/SelectSlotScreen.tsx`

**Interfaces:**
- Consumes: `useTurfResources()` (Task 4), same pattern as Task 5.

- [ ] **Step 1: Replace `useDefaultTurf` with sport/resource state**

Update the import at the top of the file:

```ts
import { useTurfResources, useInvalidateBookingQueries, useTurfSlots } from '@/features/booking/useBooking';
```

Replace `const { data: turf } = useDefaultTurf();` (currently line 33) with:

```ts
const { data: turfResources } = useTurfResources();
const [selectedSport, setSelectedSport] = useState<'TURF' | 'PICKLEBALL'>('TURF');
const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

const resourcesForSport = useMemo(
  () => (turfResources ?? []).filter((r) => r.sport === selectedSport),
  [turfResources, selectedSport]
);
const turf = selectedSport === 'TURF'
  ? resourcesForSport[0]
  : resourcesForSport.find((r) => r.id === selectedResourceId);

useEffect(() => {
  setSelectedResourceId(null);
}, [selectedSport]);
```

`useMemo` is already imported at the top of this file (`import { useEffect, useMemo, useRef, useState } from 'react';`), so no import change needed for that. Every existing use of `turf?.id` (the `useTurfSlots(turf?.id, selectedDate)` call at line 60, `invalidateBooking({ teamId, turfId: turf?.id })` in `handleConfirm`) stays as-is — `turf` now just resolves differently.

- [ ] **Step 2: Add the Sport selector + Court picker UI**

Insert directly after the `teamCard` View and before the `Text style={styles.sectionTitle}>Select Date</Text>` block:

```tsx
<Text style={styles.sectionTitle}>Select Sport</Text>
<View style={styles.sportRow}>
  {(['TURF', 'PICKLEBALL'] as const).map((sport) => (
    <Pressable
      key={sport}
      style={[styles.sportChip, selectedSport === sport && styles.sportChipSelected]}
      onPress={() => setSelectedSport(sport)}
    >
      <Ionicons
        name={sport === 'TURF' ? 'football-outline' : 'tennisball-outline'}
        size={16}
        color={selectedSport === sport ? '#FFFFFF' : colors.text}
      />
      <Text style={[styles.sportChipText, selectedSport === sport && styles.sportChipTextSelected]}>
        {sport === 'TURF' ? 'Turf' : 'Pickleball'}
      </Text>
    </Pressable>
  ))}
</View>

{selectedSport === 'PICKLEBALL' && (
  <>
    <Text style={styles.sectionTitle}>Select Court</Text>
    <View style={styles.sportRow}>
      {resourcesForSport.map((court) => (
        <Pressable
          key={court.id}
          style={[styles.sportChip, selectedResourceId === court.id && styles.sportChipSelected]}
          onPress={() => setSelectedResourceId(court.id)}
        >
          <Text style={[styles.sportChipText, selectedResourceId === court.id && styles.sportChipTextSelected]}>
            {court.name.replace('Pickleball ', '')}
          </Text>
        </Pressable>
      ))}
    </View>
  </>
)}
```

Add matching styles to this file's `StyleSheet.create` block:

```ts
sportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
sportChip: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  paddingVertical: spacing.sm,
  paddingHorizontal: spacing.md,
  borderRadius: radii.pill,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: '#FFFFFF',
},
sportChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
sportChipText: { fontSize: 13, fontWeight: '700', color: colors.text },
sportChipTextSelected: { color: '#FFFFFF' },
```

- [ ] **Step 3: Update `computeBookingPreview` for weekday/weekend awareness**

This file's preview function (around line 441) groups by `rateType`/`isDay` into `PreviewGroup`, a different shape than `BookTurfScreen`'s — keep that grouping structure, only change the rate resolution. Replace the function signature and the `rate` computation:

```ts
function computeBookingPreview(
  sortedSlots: TurfSlot[],
  plan: MembershipPlan | undefined,
  isoDate: string
): BookingPreview {
  if (!plan || sortedSlots.length === 0) {
    return { groups: [], totalCredits: 0, rangeLabel: '' };
  }

  const isWeekend = [0, 6].includes(new Date(`${isoDate}T00:00:00`).getDay());
  const standardNightRate = isWeekend
    ? plan.standard_night_weekend_rate_per_hour
    : plan.standard_night_weekday_rate_per_hour;

  let remaining = plan.discounted_hours_cap_per_24h ?? Number.POSITIVE_INFINITY;
  const groups = new Map<string, PreviewGroup>();
  let totalCredits = 0;

  for (const slot of sortedSlots) {
    const startHour = parseInt(slot.start_time.split(':')[0] ?? '0', 10);
    const isDay = startHour >= 5 && startHour < 17;
    const useMembershipRate = remaining > 0;
    if (useMembershipRate) remaining -= 1;
    const rateType: 'membership' | 'standard' = useMembershipRate ? 'membership' : 'standard';
    const rate = useMembershipRate
      ? isDay
        ? plan.membership_day_rate_per_hour
        : plan.membership_night_rate_per_hour
      : isDay
        ? plan.standard_day_rate_per_hour
        : standardNightRate;

    totalCredits += rate;
    const key = `${rateType}-${isDay ? 'day' : 'night'}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.subtotal += rate;
    } else {
      groups.set(key, { key, rateType, isDay, rate, count: 1, subtotal: rate });
    }
  }
```

(the rest of the function, building `rangeLabel` and returning `{ groups: Array.from(groups.values()), totalCredits, rangeLabel }`, is unchanged — only the lines shown above change).

Update the call site (currently `const preview = useMemo(() => computeBookingPreview(selectedSlots, plan), [selectedSlots, plan]);` at line 105):

```ts
const preview = useMemo(
  () => computeBookingPreview(selectedSlots, plan, selectedDate),
  [selectedSlots, plan, selectedDate]
);
```

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint` from `mobile/`.
Expected: both fully clean now — this was the last file with outstanding errors from Task 4's type changes.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/features/admin/screens/booking/SelectSlotScreen.tsx
git commit -m "Add Sport/Court selection to the Admin Create Booking flow

Mirrors the member-side Book Turf screen's Turf/Pickleball selection and
weekday/weekend-aware preview pricing, keeping both booking entry points
consistent."
```

---

### Task 7: Membership plan display updates

**Files:**
- Modify: `mobile/src/features/team/screens/ChooseMembershipScreen.tsx:217-221`
- Modify: `mobile/src/features/admin/screens/ActivateMembershipScreen.tsx:113-117`
- Modify: `mobile/src/features/admin/screens/create/CreateSelectMembershipScreen.tsx:121-125`
- Modify: `mobile/src/features/admin/screens/create/TeamCreatedScreen.tsx:124-128`

**Interfaces:** none — display-only text changes, no new exports.

- [ ] **Step 1: `ChooseMembershipScreen.tsx`**

Replace:

```tsx
<PlanFeature text={`All Days 5AM–5PM: ₹${plan.membership_day_rate_per_hour}/hr`} />
<PlanFeature text={`All Days 5PM–Midnight: ₹${plan.membership_night_rate_per_hour}/hr`} />
```
```tsx
        text={`Standard price: 5AM–5PM ₹${plan.standard_day_rate_per_hour}/hr · 5PM–Midnight ₹${plan.standard_night_rate_per_hour}/hr`}
```

with:

```tsx
<PlanFeature text={`All Days 5AM–5PM: ₹${plan.membership_day_rate_per_hour}/hr`} />
<PlanFeature text={`All Days 5PM–Midnight: ₹${plan.membership_night_rate_per_hour}/hr`} />
<PlanFeature text="Credits shared across Turf & Pickleball" />
```
```tsx
        text={`Standard price: 5AM–5PM ₹${plan.standard_day_rate_per_hour}/hr · Weekday 5PM–Mid ₹${plan.standard_night_weekday_rate_per_hour}/hr · Weekend 5PM–Mid ₹${plan.standard_night_weekend_rate_per_hour}/hr`}
```

- [ ] **Step 2: `ActivateMembershipScreen.tsx`, `CreateSelectMembershipScreen.tsx`, `TeamCreatedScreen.tsx`**

Each of these three files only displays `membership_day_rate_per_hour` and `standard_day_rate_per_hour` (the day-band rate, shown as the headline "member vs standard" comparison) — neither references `standard_night_rate_per_hour` directly, so no field-name fix is needed in these three. Confirm this by re-running the earlier grep after Task 4's type change — if `npm run typecheck` is clean for these three files already, no edit is needed here beyond visual confirmation the numbers now read 350/400 (via the DB values from Task 1, not a code change).

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint` from `mobile/`.
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/features/team/screens/ChooseMembershipScreen.tsx
git commit -m "Update membership plan display for new rates + shared credits note

ChooseMembershipScreen now shows the weekday/weekend split on the
standard night rate and notes credits are shared across Turf and
Pickleball. The three admin-side plan screens only ever displayed the
day-band rate, which already reflects the new value via the DB update
in Task 1 — no code change needed there."
```

---

## Post-implementation manual check

Not a task with its own commit — a final end-to-end sanity pass once all 7 tasks are done:

1. Run `npx expo start` from `mobile/`, open the app.
2. As a Host on an ACTIVE-membership Team: Team → Book Turf → confirm the Sport selector shows Turf and Pickleball, Pickleball shows 4 courts, and picking a court shows that court's real slot grid.
3. Select a weekday evening slot and a weekend evening slot (different days, two separate bookings) on the same Pickleball court and confirm the preview's Standard Night line shows different ₹/hr for each, matching the spec's 700/800 split.
4. Confirm one real booking end-to-end and verify in Supabase (`select * from bookings order by created_at desc limit 1;`) that `total_credits` and the rate-snapshot columns match what the preview showed.
5. Repeat steps 2–4 on the Admin Create Booking flow.
6. Open the Choose Membership screen and confirm both plans show the new rate numbers and the shared-credits note.
