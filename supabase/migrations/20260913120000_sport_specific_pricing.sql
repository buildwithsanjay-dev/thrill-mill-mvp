-- Sport-specific membership/standard rates + per-sport discount-hour cap.
--
-- Reverses two rules that were previously locked in CLAUDE.md ("Rates being
-- identical for Turf and Pickleball" and "the rolling-24h discount-hour cap
-- being shared across both sports") per the project owner's explicit,
-- multi-round-confirmed instruction on 2026-09-13: Turf/Football and
-- Pickleball now have genuinely different rate tables, and the ₹10,000
-- plan's 3-discounted-hour/24h cap is tracked SEPARATELY per sport (3 Turf
-- hours + 3 Pickleball hours, two independent rolling windows), not as one
-- shared counter. The ₹25,000 plan stays uncapped and structurally
-- unchanged. Credits themselves remain one shared Team wallet balance,
-- spendable on either sport — only the *rate* and *discount-cap counting*
-- become sport-aware, not the wallet/credit model itself.
--
-- New confirmed rates (₹/hr):
--   Turf/Football  — member day 450, member night 800,
--                    standard day 500, standard night weekday 1000, weekend 1000
--   Pickleball     — member day 350, member night 650,
--                    standard day 400, standard night weekday 700, weekend 800
-- Identical for both plans (PLAN_10K / PLAN_25K) — the plans differ only in
-- discounted_hours_cap_per_24h and credits_allocated, both still columns on
-- membership_plans, untouched here. Kept as a per-(plan, sport) table (not a
-- single sport-keyed constant table) so a future plan-specific rate change
-- doesn't require restructuring again.

-- 1. New per-(plan, sport) rate table -----------------------------------
create table public.membership_plan_sport_rates (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.membership_plans(id) on delete cascade,
  sport public.sport_type not null,
  membership_day_rate_per_hour integer not null check (membership_day_rate_per_hour > 0),
  membership_night_rate_per_hour integer not null check (membership_night_rate_per_hour > 0),
  standard_day_rate_per_hour integer not null check (standard_day_rate_per_hour > 0),
  standard_night_weekday_rate_per_hour integer not null check (standard_night_weekday_rate_per_hour > 0),
  standard_night_weekend_rate_per_hour integer not null check (standard_night_weekend_rate_per_hour > 0),
  created_at timestamptz not null default now(),
  unique (plan_id, sport)
);

alter table public.membership_plan_sport_rates enable row level security;

-- Same read-access pattern as membership_plans itself (public catalog, no
-- client writes — future price changes are an explicit migration per
-- CLAUDE.md).
create policy membership_plan_sport_rates_select on public.membership_plan_sport_rates
  for select to authenticated
  using (true);

insert into public.membership_plan_sport_rates
  (plan_id, sport, membership_day_rate_per_hour, membership_night_rate_per_hour,
   standard_day_rate_per_hour, standard_night_weekday_rate_per_hour, standard_night_weekend_rate_per_hour)
select p.id, s.sport, s.membership_day, s.membership_night, s.standard_day, s.standard_weekday_night, s.standard_weekend_night
from public.membership_plans p
cross join (
  values
    ('TURF'::public.sport_type, 450, 800, 500, 1000, 1000),
    ('PICKLEBALL'::public.sport_type, 350, 650, 400, 700, 800)
) as s(sport, membership_day, membership_night, standard_day, standard_weekday_night, standard_weekend_night)
where p.code in ('PLAN_10K', 'PLAN_25K');

-- 2. Drop the now-superseded flat rate columns from membership_plans -----
-- discounted_hours_cap_per_24h, credits_allocated, price_inr, code, name,
-- is_active all stay untouched — only the sport-agnostic rate columns move
-- out to the table above.
alter table public.membership_plans
  drop column membership_day_rate_per_hour,
  drop column membership_night_rate_per_hour,
  drop column standard_day_rate_per_hour,
  drop column standard_night_weekday_rate_per_hour,
  drop column standard_night_weekend_rate_per_hour;

-- 3. fn_confirm_booking — resolve sport from the booked slot's turf_resources
--    row, look up rates from membership_plan_sport_rates instead of reading
--    columns directly off membership_plans, and scope the rolling-24h
--    discount-hour window COUNT to bookings on the SAME sport only.
-- ============================================================================

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
  v_rates public.membership_plan_sport_rates%rowtype;
  v_sport public.sport_type;
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

  select tr.sport into v_sport from public.turf_resources tr where tr.id = v_slot.turf_id;

  select * into v_membership from public.team_memberships
    where team_id = v_hold.team_id and status = 'ACTIVE';
  if not found then
    raise exception 'MEMBERSHIP_INACTIVE' using errcode = '22023';
  end if;

  select * into v_plan from public.membership_plans where id = v_membership.plan_id;
  select * into v_rates from public.membership_plan_sport_rates
    where plan_id = v_plan.id and sport = v_sport;

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
    then v_rates.standard_night_weekend_rate_per_hour
    else v_rates.standard_night_weekday_rate_per_hour
  end;

  if v_plan.discounted_hours_cap_per_24h is null then
    v_discount_remaining := v_duration_hours;
  else
    -- Per-sport window: only this sport's confirmed hours count against
    -- this sport's cap — a Pickleball hour no longer consumes Turf's
    -- allowance or vice versa.
    select coalesce(sum(b.membership_day_hours + b.membership_night_hours), 0)
      into v_discounted_used_in_window
      from public.bookings b
      join public.turf_resources tr on tr.id = b.turf_id
      where b.team_id = v_hold.team_id
        and tr.sport = v_sport
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
        v_total_credits := v_total_credits + v_rates.membership_day_rate_per_hour;
      else
        v_membership_night_hours := v_membership_night_hours + 1;
        v_total_credits := v_total_credits + v_rates.membership_night_rate_per_hour;
      end if;
    else
      if v_is_day then
        v_standard_day_hours := v_standard_day_hours + 1;
        v_total_credits := v_total_credits + v_rates.standard_day_rate_per_hour;
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
     v_rates.membership_day_rate_per_hour, v_rates.membership_night_rate_per_hour,
     v_rates.standard_day_rate_per_hour, v_standard_night_rate,
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

  perform public.fn_send_push_notification(
    auth.uid(),
    'BOOKING_CONFIRMED',
    'Booking Confirmed',
    'Your booking is confirmed. Tap to view details.',
    jsonb_build_object('booking_id', v_booking_id, 'team_id', v_hold.team_id)
  );

  return v_booking_id;
end;
$$;

-- 4. fn_confirm_multi_slot_booking — same rate/window changes as above, plus
--    a new SLOTS_MUST_BE_SAME_SPORT guard: the discount-cap window is now
--    tracked per sport, and a single shared v_discount_remaining counter
--    walked across the whole batch would be wrong if the batch mixed
--    sports. The app's own UI never presents a mixed-sport slot grid (one
--    sport/court's grid at a time), so this should never legitimately
--    trigger — it exists purely as a server-side backstop, matching
--    CLAUDE.md's "never trust client-supplied ... availability" rule.
-- ============================================================================

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
  v_rates public.membership_plan_sport_rates%rowtype;
  v_sport public.sport_type;
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
    if v_sport is null then
      select tr.sport into v_sport from public.turf_resources tr where tr.id = v_slot.turf_id;
    else
      if (select tr.sport from public.turf_resources tr where tr.id = v_slot.turf_id) <> v_sport then
        raise exception 'SLOTS_MUST_BE_SAME_SPORT' using errcode = '22023';
      end if;
    end if;
  end loop;

  select * into v_rates from public.membership_plan_sport_rates
    where plan_id = v_plan.id and sport = v_sport;

  v_is_weekend := extract(isodow from v_slot_date) in (6, 7);
  v_standard_night_rate := case when v_is_weekend
    then v_rates.standard_night_weekend_rate_per_hour
    else v_rates.standard_night_weekday_rate_per_hour
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
      join public.turf_resources tr on tr.id = b.turf_id
      where b.team_id = v_team_id
        and tr.sport = v_sport
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
        v_total_credits := v_total_credits + (case when v_is_day then v_rates.membership_day_rate_per_hour else v_rates.membership_night_rate_per_hour end);
      else
        v_total_credits := v_total_credits + (case when v_is_day then v_rates.standard_day_rate_per_hour else v_standard_night_rate end);
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
          v_slot_credits := v_slot_credits + v_rates.membership_day_rate_per_hour;
        else
          v_membership_night_hours := v_membership_night_hours + 1;
          v_slot_credits := v_slot_credits + v_rates.membership_night_rate_per_hour;
        end if;
      else
        if v_is_day then
          v_standard_day_hours := v_standard_day_hours + 1;
          v_slot_credits := v_slot_credits + v_rates.standard_day_rate_per_hour;
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
       v_rates.membership_day_rate_per_hour, v_rates.membership_night_rate_per_hour,
       v_rates.standard_day_rate_per_hour, v_standard_night_rate,
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

  perform public.fn_send_push_notification(
    auth.uid(),
    'BOOKING_CONFIRMED',
    'Booking Confirmed',
    case when array_length(v_booking_ids, 1) = 1
      then 'Your booking is confirmed. Tap to view details.'
      else array_length(v_booking_ids, 1) || ' slots booked and confirmed. Tap to view details.'
    end,
    jsonb_build_object('booking_ids', to_jsonb(v_booking_ids), 'team_id', v_team_id)
  );

  return v_booking_ids;
end;
$$;
