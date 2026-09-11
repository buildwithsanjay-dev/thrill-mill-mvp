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
    -- ₹25,000 plan: no cap, every hour at the membership day/night rate.
    v_discount_remaining := v_duration_hours;
  else
    -- ₹10,000 plan: rolling 24h window of already-consumed membership-rate
    -- hours, trailing back from this session's start, counting only live
    -- (not cancelled/expired/failed) bookings.
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

  -- Lock every hold up front (fixed array order avoids lock-order deadlocks
  -- between two concurrent multi-slot confirms sharing a slot).
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
    v_discount_remaining := 2147483647; -- unlimited (₹25,000 plan)
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

  -- Pass 1: price every slot (chronological order, one shared discount
  -- counter draining across the whole batch) and total the batch, WITHOUT
  -- writing anything yet — so an insufficient-credits failure never leaves
  -- a partial set of bookings behind.
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

  -- Reset the discount counter and actually walk the batch again to write
  -- one booking row per slot, applying the debit incrementally so each
  -- booking's own wallet_ledger entry carries a correct, chained
  -- balance_after (same 1:1 booking:ledger-entry convention as
  -- fn_confirm_booking) instead of one lump-sum entry across N bookings.
  if v_plan.discounted_hours_cap_per_24h is null then
    v_discount_remaining := 2147483647; -- unlimited (₹25,000 plan)
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
