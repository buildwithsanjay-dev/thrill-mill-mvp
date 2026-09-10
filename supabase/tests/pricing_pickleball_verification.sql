-- =============================================================================
-- Pricing / Pickleball / shared-credits verification script
-- =============================================================================
--
-- Purpose:
--   Proves the financial correctness of fn_confirm_booking / fn_confirm_multi_slot_booking
--   (supabase/migrations/20260910094752_pickleball_and_pricing_rework.sql and
--   20260910095422_weekday_weekend_pricing_rpcs.sql) for the scenarios that matter most:
--     1. Weekday vs weekend standard-night rate on a Pickleball court.
--     2. The PLAN_10K discount cap still correctly falling through to the standard
--        day rate on the 4th booked hour within a rolling 24h window.
--     3. Cross-sport shared wallet: a Turf booking and a Pickleball booking for the
--        same Team both debit the same team_wallets row (credits are shared across
--        sports, per docs/superpowers/specs/2026-09-10-pricing-pickleball-shared-credits-design.md).
--     4. Cross-sport price parity + shared discount-hour cap: a Turf hour and a
--        Pickleball hour price identically per-hour, and the PLAN_10K rolling-24h
--        discount allowance is a single Team-wide counter, not tracked per sport
--        (whole-branch review Finding 3).
--
-- How to run:
--   - Via Supabase SQL editor or `psql "$DATABASE_URL" -f supabase/tests/pricing_pickleball_verification.sql`,
--     as a role that can run `set_config('request.jwt.claim.sub', ...)` and call the
--     SECURITY DEFINER booking RPCs (the `postgres` / service role works; anon/authenticated
--     roles also work as long as the impersonated user is a real Host/Co-host of the
--     fixture Team found below).
--   - Or paste each `begin ... rollback;` block individually into mcp__supabase__execute_sql.
--
-- IMPORTANT — this is a MANUAL regression script, not part of an automated CI suite.
--   This project has no test framework wired up yet (no pgTAP, no Jest-for-SQL — see
--   CLAUDE.md's Testing Requirements: "Test tooling ... is not yet set up"). Nothing here
--   runs automatically on push/PR. Whenever the pricing RPCs
--   (fn_confirm_booking, fn_confirm_multi_slot_booking) or the rate/cap columns on
--   membership_plans change, a human (or Claude) must re-run this file by hand and
--   confirm every block prints its PASS notice with no exception.
--
-- Design notes:
--   - Every block is wrapped in `begin ... rollback;` — nothing here ever persists.
--     Re-querying team_wallets.available_credits after any block will show it unchanged.
--   - Every block looks up its own fixture data dynamically (an existing ACTIVE Team on
--     the relevant plan, an existing Pickleball/Turf resource, a Host/Co-host member to
--     impersonate, and slot dates far enough in the future to be free) rather than
--     hardcoding UUIDs, so this script stays runnable as the database changes over time.
--   - `auth.uid()` reads `request.jwt.claim.sub` (see `auth.uid()`'s definition) — since a
--     direct SQL session has no Supabase Auth JWT, each block impersonates a real
--     Host/Co-host of the fixture Team via `perform set_config('request.jwt.claim.sub', ...)`
--     so `fn_is_team_host_or_cohost()` inside the RPCs authorizes the call, exactly as it
--     would for that user through the app.
--   - Each block picks a slot date at least 14 days out and requires no existing
--     CONFIRMED/IN_PROGRESS/COMPLETED booking for the fixture Team in the prior day, so a
--     stray real booking near "today" can't skew the rolling-24h discount count. If no
--     such date/slot combination is found within the search window, the block raises a
--     clear NO_FIXTURE exception rather than silently mis-testing.
--   - Block 1 deliberately searches for its weekend test date starting several days after
--     its weekday test date (not just "the next available weekend"). The discount cap is a
--     TRUE rolling 24h window keyed off each booking's own start time, not a per-calendar-day
--     counter: if the weekday and weekend test dates were only ~1 day apart, the weekend
--     day-hours' own 24h lookback would reach back into the weekday's discounted hours
--     (correctly forcing the weekend day-hours to standard rate too), which would then leave
--     the weekend NIGHT hour's own (later-starting, 24h-shifted) window not overlapping any
--     *actually-discounted* prior booking — so it would legitimately see 0 hours consumed and
--     re-grant the discount, defeating the point of the test (confirmed by hand while writing
--     this script — this is correct sliding-window behavior of the RPC, not a bug, but it means
--     the two test dates must be spaced apart to isolate what this block is actually checking).
--
-- =============================================================================


-- -----------------------------------------------------------------------------
-- Block 1: Weekday vs weekend standard-night rate on a Pickleball court
--   Expect: a night hour booked once the PLAN_10K discount cap is exhausted for
--   that day prices at 700 on a weekday and 800 on a weekend (the two distinct
--   standard_night_weekday_rate_per_hour / standard_night_weekend_rate_per_hour
--   columns added by the pricing rework).
-- -----------------------------------------------------------------------------
begin;

do $$
declare
  v_team_id uuid;
  v_cap integer;
  v_host uuid;
  v_court_id uuid;
  v_day_hours time[];
  v_i integer;
  v_weekday_date date;
  v_weekend_date date;
  v_slot_ids uuid[];
  v_hold_ids uuid[];
  v_sid uuid;
  v_hid uuid;
  v_night_slot uuid;
  v_night_hold uuid;
  v_booking_ids uuid[];
  v_night_booking uuid[];
  v_weekday_credits numeric;
  v_weekend_credits numeric;
begin
  -- Fixture: an ACTIVE Team on a capped plan (PLAN_10K), and one of its Host/Co-hosts.
  select tm.team_id, mp.discounted_hours_cap_per_24h
    into v_team_id, v_cap
    from public.team_memberships tm
    join public.membership_plans mp on mp.id = tm.plan_id
    where tm.status = 'ACTIVE' and mp.discounted_hours_cap_per_24h is not null
    limit 1;
  if v_team_id is null then
    raise exception 'NO_FIXTURE: no ACTIVE Team found on a capped membership plan';
  end if;

  select user_id into v_host from public.team_members
    where team_id = v_team_id and status = 'ACTIVE' and team_role in ('HOST', 'CO_HOST')
    limit 1;
  if v_host is null then
    raise exception 'NO_FIXTURE: fixture Team % has no ACTIVE Host/Co-host', v_team_id;
  end if;

  select id into v_court_id from public.turf_resources where sport = 'PICKLEBALL' limit 1;
  if v_court_id is null then
    raise exception 'NO_FIXTURE: no Pickleball turf_resources row found';
  end if;

  -- v_cap consecutive day-band hours starting at 09:00, used to exhaust the discount cap.
  v_day_hours := array[]::time[];
  for v_i in 0 .. v_cap - 1 loop
    v_day_hours := v_day_hours || make_time(9 + v_i, 0, 0);
  end loop;

  -- Find a weekday with all v_day_hours + 19:00 AVAILABLE, far enough out and with no
  -- existing confirmed booking for this Team in the prior day (keeps the rolling-24h
  -- discount count predictable).
  select ts.slot_date into v_weekday_date
    from public.turf_slots ts
    where ts.turf_id = v_court_id
      and ts.status = 'AVAILABLE'
      and ts.slot_date > current_date + interval '14 days'
      and extract(isodow from ts.slot_date) not in (6, 7)
      and ts.start_time = any(v_day_hours || array[time '19:00:00'])
      and not exists (
        select 1 from public.bookings b
        where b.team_id = v_team_id and b.status in ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
          and b.booking_date between ts.slot_date - 1 and ts.slot_date
      )
    group by ts.slot_date
    having count(distinct ts.start_time) = array_length(v_day_hours, 1) + 1
    order by ts.slot_date
    limit 1;

  -- Spaced well clear of v_weekday_date (see Design notes above) so the two test
  -- windows can't bleed into each other via the rolling-24h discount lookback.
  select ts.slot_date into v_weekend_date
    from public.turf_slots ts
    where ts.turf_id = v_court_id
      and ts.status = 'AVAILABLE'
      and ts.slot_date > coalesce(v_weekday_date, current_date + interval '14 days') + interval '7 days'
      and extract(isodow from ts.slot_date) in (6, 7)
      and ts.start_time = any(v_day_hours || array[time '19:00:00'])
      and not exists (
        select 1 from public.bookings b
        where b.team_id = v_team_id and b.status in ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
          and b.booking_date between ts.slot_date - 1 and ts.slot_date
      )
    group by ts.slot_date
    having count(distinct ts.start_time) = array_length(v_day_hours, 1) + 1
    order by ts.slot_date
    limit 1;

  if v_weekday_date is null or v_weekend_date is null then
    raise exception 'NO_FIXTURE: could not find a free weekday+weekend date pair on Pickleball court % with % day slots + 19:00 free', v_court_id, array_length(v_day_hours, 1);
  end if;

  perform set_config('request.jwt.claim.sub', v_host::text, true);

  -- --- Weekday: consume the cap, then book the night hour ---
  select array_agg(id order by start_time) into v_slot_ids
    from public.turf_slots
    where turf_id = v_court_id and slot_date = v_weekday_date and start_time = any(v_day_hours) and status = 'AVAILABLE';

  v_hold_ids := '{}';
  foreach v_sid in array v_slot_ids loop
    insert into public.slot_holds (slot_id, team_id, status, expires_at)
      values (v_sid, v_team_id, 'ACTIVE', now() + interval '1 minute') returning id into v_hid;
    update public.turf_slots set status = 'HELD' where id = v_sid;
    v_hold_ids := v_hold_ids || v_hid;
  end loop;
  perform public.fn_confirm_multi_slot_booking(v_hold_ids, array[v_host]);

  select id into v_night_slot from public.turf_slots
    where turf_id = v_court_id and slot_date = v_weekday_date and start_time = '19:00:00' and status = 'AVAILABLE';
  insert into public.slot_holds (slot_id, team_id, status, expires_at)
    values (v_night_slot, v_team_id, 'ACTIVE', now() + interval '1 minute') returning id into v_night_hold;
  update public.turf_slots set status = 'HELD' where id = v_night_slot;
  v_night_booking := public.fn_confirm_multi_slot_booking(array[v_night_hold], array[v_host]);
  select total_credits into v_weekday_credits from public.bookings where id = v_night_booking[1];

  -- --- Weekend: same pattern, different date ---
  select array_agg(id order by start_time) into v_slot_ids
    from public.turf_slots
    where turf_id = v_court_id and slot_date = v_weekend_date and start_time = any(v_day_hours) and status = 'AVAILABLE';

  v_hold_ids := '{}';
  foreach v_sid in array v_slot_ids loop
    insert into public.slot_holds (slot_id, team_id, status, expires_at)
      values (v_sid, v_team_id, 'ACTIVE', now() + interval '1 minute') returning id into v_hid;
    update public.turf_slots set status = 'HELD' where id = v_sid;
    v_hold_ids := v_hold_ids || v_hid;
  end loop;
  perform public.fn_confirm_multi_slot_booking(v_hold_ids, array[v_host]);

  select id into v_night_slot from public.turf_slots
    where turf_id = v_court_id and slot_date = v_weekend_date and start_time = '19:00:00' and status = 'AVAILABLE';
  insert into public.slot_holds (slot_id, team_id, status, expires_at)
    values (v_night_slot, v_team_id, 'ACTIVE', now() + interval '1 minute') returning id into v_night_hold;
  update public.turf_slots set status = 'HELD' where id = v_night_slot;
  v_night_booking := public.fn_confirm_multi_slot_booking(array[v_night_hold], array[v_host]);
  select total_credits into v_weekend_credits from public.bookings where id = v_night_booking[1];

  raise notice 'Block 1: weekday(%)=% weekend(%)=%', v_weekday_date, v_weekday_credits, v_weekend_date, v_weekend_credits;

  if v_weekday_credits <> 700 then
    raise exception 'FAIL Block 1: expected weekday standard-night rate 700, got %', v_weekday_credits;
  end if;
  if v_weekend_credits <> 800 then
    raise exception 'FAIL Block 1: expected weekend standard-night rate 800, got %', v_weekend_credits;
  end if;

  raise notice 'PASS Block 1: weekday=700, weekend=800 on Pickleball court after cap exhaustion';
end $$;

rollback;


-- -----------------------------------------------------------------------------
-- Block 2: PLAN_10K's discount cap still falls through to the standard DAY rate
--   correctly on the (cap+1)-th hour.
--   Expect (with the current cap of 3 and rates 350 membership / 400 standard):
--     total_credits summed across the batch = 350*cap + 400
--     the last hour's own total_credits = 400 (not 350)
-- -----------------------------------------------------------------------------
begin;

do $$
declare
  v_team_id uuid;
  v_cap integer;
  v_host uuid;
  v_court_id uuid;
  v_hours time[];
  v_i integer;
  v_date date;
  v_slot_ids uuid[];
  v_hold_ids uuid[];
  v_sid uuid;
  v_hid uuid;
  v_booking_ids uuid[];
  v_total numeric;
  v_last_hour_credits numeric;
  v_membership_day_rate numeric;
  v_standard_day_rate numeric;
begin
  select tm.team_id, mp.discounted_hours_cap_per_24h,
         mp.membership_day_rate_per_hour, mp.standard_day_rate_per_hour
    into v_team_id, v_cap, v_membership_day_rate, v_standard_day_rate
    from public.team_memberships tm
    join public.membership_plans mp on mp.id = tm.plan_id
    where tm.status = 'ACTIVE' and mp.discounted_hours_cap_per_24h is not null
    limit 1;
  if v_team_id is null then
    raise exception 'NO_FIXTURE: no ACTIVE Team found on a capped membership plan';
  end if;

  select user_id into v_host from public.team_members
    where team_id = v_team_id and status = 'ACTIVE' and team_role in ('HOST', 'CO_HOST')
    limit 1;
  if v_host is null then
    raise exception 'NO_FIXTURE: fixture Team % has no ACTIVE Host/Co-host', v_team_id;
  end if;

  select id into v_court_id from public.turf_resources where sport = 'PICKLEBALL' limit 1;
  if v_court_id is null then
    raise exception 'NO_FIXTURE: no Pickleball turf_resources row found';
  end if;

  -- cap+1 consecutive day-band hours starting at 09:00: the first `cap` hours should
  -- land at the membership rate, the (cap+1)-th hour should fall to the standard rate.
  v_hours := array[]::time[];
  for v_i in 0 .. v_cap loop
    v_hours := v_hours || make_time(9 + v_i, 0, 0);
  end loop;

  select ts.slot_date into v_date
    from public.turf_slots ts
    where ts.turf_id = v_court_id
      and ts.status = 'AVAILABLE'
      and ts.slot_date > current_date + interval '14 days'
      and ts.start_time = any(v_hours)
      and not exists (
        select 1 from public.bookings b
        where b.team_id = v_team_id and b.status in ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
          and b.booking_date between ts.slot_date - 1 and ts.slot_date
      )
    group by ts.slot_date
    having count(distinct ts.start_time) = array_length(v_hours, 1)
    order by ts.slot_date
    limit 1;

  if v_date is null then
    raise exception 'NO_FIXTURE: could not find a free date on Pickleball court % with % consecutive day slots from 09:00', v_court_id, array_length(v_hours, 1);
  end if;

  perform set_config('request.jwt.claim.sub', v_host::text, true);

  select array_agg(id order by start_time) into v_slot_ids
    from public.turf_slots
    where turf_id = v_court_id and slot_date = v_date and start_time = any(v_hours) and status = 'AVAILABLE';

  v_hold_ids := '{}';
  foreach v_sid in array v_slot_ids loop
    insert into public.slot_holds (slot_id, team_id, status, expires_at)
      values (v_sid, v_team_id, 'ACTIVE', now() + interval '1 minute') returning id into v_hid;
    update public.turf_slots set status = 'HELD' where id = v_sid;
    v_hold_ids := v_hold_ids || v_hid;
  end loop;

  v_booking_ids := public.fn_confirm_multi_slot_booking(v_hold_ids, array[v_host]);

  select coalesce(sum(total_credits), 0) into v_total from public.bookings where id = any(v_booking_ids);
  select total_credits into v_last_hour_credits
    from public.bookings where id = v_booking_ids[array_length(v_booking_ids, 1)];

  raise notice 'Block 2: date=% cap=% total=% last_hour=% (expected total=%, last_hour=%)',
    v_date, v_cap, v_total, v_last_hour_credits,
    (v_membership_day_rate * v_cap + v_standard_day_rate), v_standard_day_rate;

  if v_total <> (v_membership_day_rate * v_cap + v_standard_day_rate) then
    raise exception 'FAIL Block 2: expected total % (%* + %), got %',
      (v_membership_day_rate * v_cap + v_standard_day_rate), v_membership_day_rate, v_standard_day_rate, v_total;
  end if;
  if v_last_hour_credits <> v_standard_day_rate then
    raise exception 'FAIL Block 2: expected (cap+1)-th hour = % (standard day rate), got %', v_standard_day_rate, v_last_hour_credits;
  end if;

  raise notice 'PASS Block 2: cap (%) still falls through to the standard day rate correctly on hour %+1: %*% + % = %',
    v_cap, v_cap, v_membership_day_rate, v_cap, v_standard_day_rate, v_total;
end $$;

rollback;


-- -----------------------------------------------------------------------------
-- Block 3: cross-sport shared wallet — a Turf booking and a Pickleball booking
--   for the same Team both debit the same team_wallets row, in sequence.
-- -----------------------------------------------------------------------------
begin;

do $$
declare
  v_team_id uuid;
  v_host uuid;
  v_turf_id uuid;
  v_pb_id uuid;
  v_turf_date date;
  v_pb_date date;
  v_turf_slot uuid;
  v_pb_slot uuid;
  v_turf_hold uuid;
  v_pb_hold uuid;
  v_turf_booking uuid[];
  v_pb_booking uuid[];
  v_balance_before numeric;
  v_balance_after_turf numeric;
  v_balance_after_pb numeric;
  v_turf_credits numeric;
  v_pb_credits numeric;
begin
  select tm.team_id into v_team_id
    from public.team_memberships tm
    where tm.status = 'ACTIVE'
    limit 1;
  if v_team_id is null then
    raise exception 'NO_FIXTURE: no ACTIVE Team membership found';
  end if;

  select user_id into v_host from public.team_members
    where team_id = v_team_id and status = 'ACTIVE' and team_role in ('HOST', 'CO_HOST')
    limit 1;
  if v_host is null then
    raise exception 'NO_FIXTURE: fixture Team % has no ACTIVE Host/Co-host', v_team_id;
  end if;

  select id into v_turf_id from public.turf_resources where sport = 'TURF' limit 1;
  select id into v_pb_id from public.turf_resources where sport = 'PICKLEBALL' limit 1;
  if v_turf_id is null or v_pb_id is null then
    raise exception 'NO_FIXTURE: missing a TURF or PICKLEBALL turf_resources row';
  end if;

  select ts.slot_date into v_turf_date
    from public.turf_slots ts
    where ts.turf_id = v_turf_id and ts.status = 'AVAILABLE'
      and ts.slot_date > current_date + interval '14 days' and ts.start_time = '09:00:00'
      and not exists (
        select 1 from public.bookings b
        where b.team_id = v_team_id and b.status in ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
          and b.booking_date between ts.slot_date - 1 and ts.slot_date
      )
    order by ts.slot_date limit 1;

  select ts.slot_date into v_pb_date
    from public.turf_slots ts
    where ts.turf_id = v_pb_id and ts.status = 'AVAILABLE'
      and ts.slot_date > current_date + interval '14 days' and ts.start_time = '09:00:00'
      and ts.slot_date <> v_turf_date
      and not exists (
        select 1 from public.bookings b
        where b.team_id = v_team_id and b.status in ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
          and b.booking_date between ts.slot_date - 1 and ts.slot_date
      )
    order by ts.slot_date limit 1;

  if v_turf_date is null or v_pb_date is null then
    raise exception 'NO_FIXTURE: could not find free 09:00 Turf/Pickleball dates for Team %', v_team_id;
  end if;

  perform set_config('request.jwt.claim.sub', v_host::text, true);

  select available_credits into v_balance_before from public.team_wallets where team_id = v_team_id;

  select id into v_turf_slot from public.turf_slots
    where turf_id = v_turf_id and slot_date = v_turf_date and start_time = '09:00:00' and status = 'AVAILABLE';
  insert into public.slot_holds (slot_id, team_id, status, expires_at)
    values (v_turf_slot, v_team_id, 'ACTIVE', now() + interval '1 minute') returning id into v_turf_hold;
  update public.turf_slots set status = 'HELD' where id = v_turf_slot;
  v_turf_booking := public.fn_confirm_multi_slot_booking(array[v_turf_hold], array[v_host]);
  select total_credits into v_turf_credits from public.bookings where id = v_turf_booking[1];

  select available_credits into v_balance_after_turf from public.team_wallets where team_id = v_team_id;

  select id into v_pb_slot from public.turf_slots
    where turf_id = v_pb_id and slot_date = v_pb_date and start_time = '09:00:00' and status = 'AVAILABLE';
  insert into public.slot_holds (slot_id, team_id, status, expires_at)
    values (v_pb_slot, v_team_id, 'ACTIVE', now() + interval '1 minute') returning id into v_pb_hold;
  update public.turf_slots set status = 'HELD' where id = v_pb_slot;
  v_pb_booking := public.fn_confirm_multi_slot_booking(array[v_pb_hold], array[v_host]);
  select total_credits into v_pb_credits from public.bookings where id = v_pb_booking[1];

  select available_credits into v_balance_after_pb from public.team_wallets where team_id = v_team_id;

  raise notice 'Block 3: before=% after_turf=%(debited %) after_pb=%(debited %)',
    v_balance_before, v_balance_after_turf, v_turf_credits, v_balance_after_pb, v_pb_credits;

  if v_balance_after_turf <> v_balance_before - v_turf_credits then
    raise exception 'FAIL Block 3: Turf booking did not debit team_wallets as expected (before=% turf_credits=% after=%)',
      v_balance_before, v_turf_credits, v_balance_after_turf;
  end if;
  if v_balance_after_pb <> v_balance_after_turf - v_pb_credits then
    raise exception 'FAIL Block 3: Pickleball booking did not debit the SAME team_wallets row in sequence (after_turf=% pb_credits=% after_pb=%)',
      v_balance_after_turf, v_pb_credits, v_balance_after_pb;
  end if;

  raise notice 'PASS Block 3: Turf and Pickleball bookings for Team % both debited the same team_wallets row (% -> % -> %)',
    v_team_id, v_balance_before, v_balance_after_turf, v_balance_after_pb;
end $$;

rollback;


-- -----------------------------------------------------------------------------
-- Block 4: cross-sport price parity + shared rolling-24h discount cap.
--   Expect (cap = v_cap, membership/standard day rates from PLAN_10K):
--     - A first-discounted-hour booked on Turf and a first-discounted-hour booked
--       on Pickleball (both within the same rolling-24h window, same Team) price
--       IDENTICALLY per hour — proving Turf and Pickleball share one rate table,
--       not sport-specific pricing.
--     - After v_cap total hours have been booked across BOTH sports (mixed, not
--       all on one sport), the (v_cap+1)-th hour — booked on Pickleball — falls to
--       the standard day rate, proving the rolling-24h discount allowance is one
--       Team-wide counter shared across sports, not a per-sport counter (which
--       would incorrectly still have discount budget left for Pickleball).
-- -----------------------------------------------------------------------------
begin;

do $$
declare
  v_team_id uuid;
  v_cap integer;
  v_host uuid;
  v_turf_id uuid;
  v_pb_id uuid;
  v_membership_day_rate numeric;
  v_standard_day_rate numeric;
  v_hours time[];
  v_i integer;
  v_date date;
  v_slot uuid;
  v_hold uuid;
  v_booking uuid[];
  v_turf_first_credits numeric;
  v_pb_first_credits numeric;
  v_cap_exceeding_credits numeric;
begin
  select tm.team_id, mp.discounted_hours_cap_per_24h,
         mp.membership_day_rate_per_hour, mp.standard_day_rate_per_hour
    into v_team_id, v_cap, v_membership_day_rate, v_standard_day_rate
    from public.team_memberships tm
    join public.membership_plans mp on mp.id = tm.plan_id
    where tm.status = 'ACTIVE' and mp.discounted_hours_cap_per_24h is not null
    limit 1;
  if v_team_id is null then
    raise exception 'NO_FIXTURE: no ACTIVE Team found on a capped membership plan';
  end if;
  if v_cap < 2 then
    raise exception 'NO_FIXTURE: capped plan''s discounted_hours_cap_per_24h (%) is too small for this test (needs >= 2)', v_cap;
  end if;

  select user_id into v_host from public.team_members
    where team_id = v_team_id and status = 'ACTIVE' and team_role in ('HOST', 'CO_HOST')
    limit 1;
  if v_host is null then
    raise exception 'NO_FIXTURE: fixture Team % has no ACTIVE Host/Co-host', v_team_id;
  end if;

  select id into v_turf_id from public.turf_resources where sport = 'TURF' limit 1;
  select id into v_pb_id from public.turf_resources where sport = 'PICKLEBALL' limit 1;
  if v_turf_id is null or v_pb_id is null then
    raise exception 'NO_FIXTURE: missing a TURF or PICKLEBALL turf_resources row';
  end if;

  -- v_cap+1 consecutive day-band hours starting at 09:00 — same slot times must be
  -- AVAILABLE on BOTH resources for the same date, since this block interleaves
  -- bookings across sports at these hours.
  v_hours := array[]::time[];
  for v_i in 0 .. v_cap loop
    v_hours := v_hours || make_time(9 + v_i, 0, 0);
  end loop;

  select ts.slot_date into v_date
    from public.turf_slots ts
    where ts.turf_id = v_turf_id
      and ts.status = 'AVAILABLE'
      and ts.slot_date > current_date + interval '14 days'
      and ts.start_time = any(v_hours)
      and not exists (
        select 1 from public.bookings b
        where b.team_id = v_team_id and b.status in ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
          and b.booking_date between ts.slot_date - 1 and ts.slot_date
      )
      and exists (
        select 1 from public.turf_slots pb
        where pb.turf_id = v_pb_id and pb.slot_date = ts.slot_date
          and pb.status = 'AVAILABLE' and pb.start_time = any(v_hours)
        group by pb.slot_date
        having count(distinct pb.start_time) = array_length(v_hours, 1)
      )
    group by ts.slot_date
    having count(distinct ts.start_time) = array_length(v_hours, 1)
    order by ts.slot_date
    limit 1;

  if v_date is null then
    raise exception 'NO_FIXTURE: could not find a date with % free day slots from 09:00 on BOTH Turf % and Pickleball %', array_length(v_hours, 1), v_turf_id, v_pb_id;
  end if;

  perform set_config('request.jwt.claim.sub', v_host::text, true);

  -- Hour 0 (first discounted hour, 09:00) on Turf.
  select id into v_slot from public.turf_slots
    where turf_id = v_turf_id and slot_date = v_date and start_time = v_hours[1] and status = 'AVAILABLE';
  insert into public.slot_holds (slot_id, team_id, status, expires_at)
    values (v_slot, v_team_id, 'ACTIVE', now() + interval '1 minute') returning id into v_hold;
  update public.turf_slots set status = 'HELD' where id = v_slot;
  v_booking := public.fn_confirm_multi_slot_booking(array[v_hold], array[v_host]);
  select total_credits into v_turf_first_credits from public.bookings where id = v_booking[1];

  -- Hour 1 (second discounted hour, 10:00) on Pickleball — same rolling-24h window
  -- as the Turf hour just booked (same Team, same day). Should price identically
  -- to the Turf hour above: both are membership-rate day hours.
  select id into v_slot from public.turf_slots
    where turf_id = v_pb_id and slot_date = v_date and start_time = v_hours[2] and status = 'AVAILABLE';
  insert into public.slot_holds (slot_id, team_id, status, expires_at)
    values (v_slot, v_team_id, 'ACTIVE', now() + interval '1 minute') returning id into v_hold;
  update public.turf_slots set status = 'HELD' where id = v_slot;
  v_booking := public.fn_confirm_multi_slot_booking(array[v_hold], array[v_host]);
  select total_credits into v_pb_first_credits from public.bookings where id = v_booking[1];

  raise notice 'Block 4: first-discounted-hour prices — turf=% pickleball=%', v_turf_first_credits, v_pb_first_credits;

  if v_turf_first_credits <> v_membership_day_rate or v_pb_first_credits <> v_membership_day_rate then
    raise exception 'FAIL Block 4: expected both first-discounted hours to price at membership day rate % (turf=%, pickleball=%)',
      v_membership_day_rate, v_turf_first_credits, v_pb_first_credits;
  end if;
  if v_turf_first_credits <> v_pb_first_credits then
    raise exception 'FAIL Block 4: Turf and Pickleball priced DIFFERENTLY for the same discounted day hour (turf=%, pickleball=%) — sport-specific pricing detected',
      v_turf_first_credits, v_pb_first_credits;
  end if;

  -- Consume the rest of the cap (hours 2 .. v_cap-1, i.e. v_cap-2 more hours) on
  -- Turf, alternating resource just to keep this from looking like "only Turf
  -- exhausts the cap" — still same Team, same rolling-24h window.
  for v_i in 3 .. v_cap loop
    select id into v_slot from public.turf_slots
      where turf_id = v_turf_id and slot_date = v_date and start_time = v_hours[v_i] and status = 'AVAILABLE';
    insert into public.slot_holds (slot_id, team_id, status, expires_at)
      values (v_slot, v_team_id, 'ACTIVE', now() + interval '1 minute') returning id into v_hold;
    update public.turf_slots set status = 'HELD' where id = v_slot;
    perform public.fn_confirm_multi_slot_booking(array[v_hold], array[v_host]);
  end loop;

  -- The (v_cap+1)-th hour overall, booked on PICKLEBALL. If the discount cap were
  -- tracked per-sport, Pickleball would (wrongly) still see its own fresh budget
  -- here since only 1 prior hour was booked on Pickleball. Since the cap is
  -- Team-wide and shared, this hour must fall through to the standard day rate.
  select id into v_slot from public.turf_slots
    where turf_id = v_pb_id and slot_date = v_date and start_time = v_hours[v_cap + 1] and status = 'AVAILABLE';
  insert into public.slot_holds (slot_id, team_id, status, expires_at)
    values (v_slot, v_team_id, 'ACTIVE', now() + interval '1 minute') returning id into v_hold;
  update public.turf_slots set status = 'HELD' where id = v_slot;
  v_booking := public.fn_confirm_multi_slot_booking(array[v_hold], array[v_host]);
  select total_credits into v_cap_exceeding_credits from public.bookings where id = v_booking[1];

  raise notice 'Block 4: cap-exceeding (hour %+1) booked on Pickleball priced at % (expected standard day rate %)',
    v_cap, v_cap_exceeding_credits, v_standard_day_rate;

  if v_cap_exceeding_credits <> v_standard_day_rate then
    raise exception 'FAIL Block 4: expected cap-exceeding hour (on Pickleball) to fall to standard day rate % (Team-wide shared cap), got % — discount cap may be tracked per-sport instead of per-Team',
      v_standard_day_rate, v_cap_exceeding_credits;
  end if;

  raise notice 'PASS Block 4: Turf/Pickleball price identically per hour (%), and the rolling-24h discount cap is shared across sports (hour %+1 on Pickleball correctly fell to standard rate %)',
    v_membership_day_rate, v_cap, v_standard_day_rate;
end $$;

rollback;
