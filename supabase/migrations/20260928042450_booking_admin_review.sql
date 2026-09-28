-- Owner feedback (2026-09-28): "if customer book a slot its showing slot
-- booked successfully but we need to show status pending, once the admin
-- cross check with turftown & then only approve the slot." A Host/Co-host
-- booking a slot now lands as PENDING_REVIEW, not CONFIRMED -- the slot is
-- still locked (nobody else can take it), the Team's credits are deducted
-- immediately (owner's explicit choice: protects the slot even if the wallet
-- moves elsewhere while waiting, exactly like the existing 1-minute hold
-- already deducts nothing early but locks the slot the same way), but the
-- booking only actually becomes CONFIRMED -- and only then does the
-- customer-facing "Booking Confirmed" push fire -- once an Admin reviews it.
-- An Admin creating a booking directly (owner's explicit choice: they're
-- presumably the one who'd be cross-checking anyway) is unaffected and stays
-- immediately CONFIRMED, same as before.

-- ============================================================================
-- 1. fn_confirm_multi_slot_booking -- the only confirm path either the
--    customer Book screen or the Admin's own booking screen actually calls
--    (fn_confirm_booking / fn_admin_confirm_booking_for_host are dead code,
--    unused by any screen -- left untouched, out of scope).
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
  -- An Admin creating a booking directly stays instantly CONFIRMED; a
  -- Host/Co-host's own booking now lands as PENDING_REVIEW until an Admin
  -- reviews it (see fn_admin_review_booking below).
  v_is_admin_caller boolean := public.fn_is_admin();
  v_booking_status public.booking_status := case when v_is_admin_caller then 'CONFIRMED' else 'PENDING_REVIEW' end;
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

  if not (public.fn_is_team_host_or_cohost(v_team_id) or v_is_admin_caller) then
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
       v_booking_status, v_slot.slot_date, v_slot.start_time, v_slot.end_time, v_slot_duration_hours,
       v_membership_day_hours, v_membership_night_hours, v_standard_day_hours, v_standard_night_hours,
       v_rates.membership_day_rate_per_hour, v_rates.membership_night_rate_per_hour,
       v_rates.standard_day_rate_per_hour, v_standard_night_rate,
       v_slot_credits, auth.uid(), case when v_is_admin_caller then now() else null end)
    returning id into v_booking_id;

    insert into public.wallet_ledger
      (team_id, entry_type, amount, balance_after, reference_type, reference_id, created_by, reason)
    values
      (v_team_id, 'BOOKING_CONSUME', -v_slot_credits, v_new_balance, 'booking', v_booking_id, auth.uid(),
       case when v_is_admin_caller then 'Booking confirmed (multi-slot)' else 'Booking submitted, pending Admin review (multi-slot)' end);

    insert into public.booking_participants (booking_id, user_id, added_by)
    select v_booking_id, unnest(p_participant_user_ids), auth.uid();

    -- Locks the slot from every other booking either way -- CONFIRMED and
    -- PENDING_REVIEW are both "not AVAILABLE" as far as turf_slots is
    -- concerned; the distinction that matters lives on the booking row.
    update public.slot_holds set status = 'CONVERTED'
      where slot_id = v_slot.id and id = any(p_hold_ids);
    update public.turf_slots set status = 'CONFIRMED' where id = v_slot.id;

    v_booking_ids := v_booking_ids || v_booking_id;
  end loop;

  if v_is_admin_caller then
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
  end if;
  -- If NOT admin: no customer-facing push here -- fn_admin_review_booking
  -- sends 'BOOKING_CONFIRMED' once an Admin actually approves it. The Admin
  -- is separately notified 'BOOKING_PENDING_REVIEW' by
  -- tg_notify_admin_booking_confirmed below, which fires on this insert
  -- regardless of status.

  return v_booking_ids;
end;
$$;

-- ============================================================================
-- 2. fn_admin_review_booking -- Approve/Decline for a PENDING_REVIEW booking.
--    A booking "override"-shaped sensitive Admin action per CLAUDE.md, so
--    both paths write an admin_audit_logs entry.
-- ============================================================================

create or replace function public.fn_admin_review_booking(
  p_booking_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_session_start timestamptz;
  v_new_balance numeric(12,2);
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.status <> 'PENDING_REVIEW' then
    raise exception 'BOOKING_NOT_PENDING' using errcode = '22023';
  end if;

  v_session_start := (v_booking.booking_date + v_booking.start_time) at time zone 'Asia/Kolkata';

  if p_approve then
    -- A pending booking nobody reviewed before its own start time can only be
    -- declined (and refunded) at this point, never retroactively approved.
    if v_session_start < now() then
      raise exception 'BOOKING_SESSION_PASSED' using errcode = '22023';
    end if;

    update public.bookings
      set status = 'CONFIRMED', confirmed_at = now()
      where id = p_booking_id;

    update public.turf_slots set status = 'CONFIRMED' where id = v_booking.slot_id;

    insert into public.admin_audit_logs
      (admin_id, action, target_type, target_id, reason, before_state, after_state)
    values
      (auth.uid(), 'BOOKING_APPROVED', 'booking', v_booking.id, p_reason,
       jsonb_build_object('status', 'PENDING_REVIEW'),
       jsonb_build_object('status', 'CONFIRMED'));

    perform public.fn_send_push_notification(
      v_booking.created_by,
      'BOOKING_CONFIRMED',
      'Booking Confirmed',
      'Your booking is confirmed. Tap to view details.',
      jsonb_build_object('booking_id', v_booking.id, 'team_id', v_booking.team_id)
    );

    return 'APPROVED';
  else
    -- Full refund regardless of timing: a PENDING_REVIEW booking was never
    -- actually confirmed, so the 24-hour cancellation-window rule (which
    -- protects a genuine commitment) doesn't apply here.
    update public.team_wallets
      set available_credits = available_credits + v_booking.total_credits
      where team_id = v_booking.team_id
      returning available_credits into v_new_balance;

    insert into public.wallet_ledger
      (team_id, entry_type, amount, balance_after, reference_type, reference_id, created_by, reason)
    values
      (v_booking.team_id, 'BOOKING_REFUND', v_booking.total_credits, v_new_balance,
       'booking', v_booking.id, auth.uid(), coalesce(p_reason, 'Booking declined on Admin review'));

    update public.bookings
      set status = 'CANCELLED', cancelled_at = now(),
          cancellation_reason = coalesce(p_reason, 'Not confirmed on Admin review')
      where id = p_booking_id;

    update public.turf_slots set status = 'AVAILABLE' where id = v_booking.slot_id;

    insert into public.admin_audit_logs
      (admin_id, action, target_type, target_id, reason, before_state, after_state)
    values
      (auth.uid(), 'BOOKING_DECLINED', 'booking', v_booking.id, p_reason,
       jsonb_build_object('status', 'PENDING_REVIEW'),
       jsonb_build_object('status', 'CANCELLED', 'refunded', true));

    perform public.fn_send_push_notification(
      v_booking.created_by,
      'BOOKING_CANCELLED',
      'Booking Not Confirmed',
      coalesce(p_reason, 'Your booking could not be confirmed and has been fully refunded.'),
      jsonb_build_object('booking_id', v_booking.id, 'team_id', v_booking.team_id)
    );

    return 'DECLINED';
  end if;
end;
$$;

revoke execute on function public.fn_admin_review_booking(uuid, boolean, text) from public, anon;
grant execute on function public.fn_admin_review_booking(uuid, boolean, text) to authenticated;

-- ============================================================================
-- 3. fn_cancel_booking -- a Host/Co-host (or Admin) can also withdraw a
--    PENDING_REVIEW booking themselves, before an Admin gets to it. Always a
--    full refund for that case, same reasoning as the decline path above.
-- ============================================================================

create or replace function public.fn_cancel_booking(
  p_booking_id uuid,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_session_start timestamptz;
  v_eligible boolean;
  v_new_balance numeric(12,2);
  v_is_admin_override boolean;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (public.fn_is_team_host_or_cohost(v_booking.team_id) or public.fn_is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  v_is_admin_override := public.fn_is_admin()
    and not coalesce(public.fn_is_team_host_or_cohost(v_booking.team_id), false);

  if v_booking.status not in ('CONFIRMED', 'PENDING_REVIEW') then
    raise exception 'CANCELLATION_NOT_ALLOWED' using errcode = '22023';
  end if;

  v_session_start := (v_booking.booking_date + v_booking.start_time) at time zone 'Asia/Kolkata';
  v_eligible := v_booking.status = 'PENDING_REVIEW' or (v_session_start - now()) >= interval '24 hours';

  if v_eligible then
    update public.team_wallets
      set available_credits = available_credits + v_booking.total_credits
      where team_id = v_booking.team_id
      returning available_credits into v_new_balance;

    insert into public.wallet_ledger
      (team_id, entry_type, amount, balance_after, reference_type, reference_id, created_by, reason)
    values
      (v_booking.team_id, 'BOOKING_REFUND', v_booking.total_credits, v_new_balance,
       'booking', v_booking.id, auth.uid(),
       coalesce(p_reason, case when v_booking.status = 'PENDING_REVIEW'
         then 'Withdrawn before Admin review' else 'Cancelled >=24h before session' end));
  end if;

  update public.bookings
    set status = 'CANCELLED', cancelled_at = now(), cancellation_reason = p_reason
    where id = p_booking_id;

  update public.turf_slots set status = 'AVAILABLE' where id = v_booking.slot_id;

  if v_is_admin_override then
    insert into public.admin_audit_logs
      (admin_id, action, target_type, target_id, reason, before_state, after_state)
    values
      (auth.uid(), 'BOOKING_CANCELLED_BY_ADMIN', 'booking', v_booking.id,
       coalesce(p_reason, case when v_eligible then 'Cancelled >=24h before session' else 'Cancelled <24h before session (no refund)' end),
       jsonb_build_object('status', v_booking.status),
       jsonb_build_object('status', 'CANCELLED', 'refunded', v_eligible));
  end if;

  return case when v_eligible then 'CANCELLED_REFUNDED' else 'CANCELLED_NO_REFUND' end;
end;
$$;

revoke execute on function public.fn_cancel_booking(uuid, text) from public, anon;
grant execute on function public.fn_cancel_booking(uuid, text) to authenticated;

-- ============================================================================
-- 4. Admin notification on a new PENDING_REVIEW booking too, not just a
--    CONFIRMED one -- otherwise an Admin-made booking still gets "New slot
--    booking" but a Host/Co-host's own booking (the one actually needing
--    review) would silently notify nobody. Grouped by created_at instead of
--    confirmed_at for this branch, since confirmed_at is null until
--    reviewed and `= null` never matches in the batching query.
-- ============================================================================

create or replace function public.tg_notify_admin_booking_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first uuid;
  v_n integer;
  v_start time;
  v_end time;
  v_team text;
begin
  if new.status = 'CONFIRMED' then
    select id into v_first from public.bookings
      where team_id = new.team_id
        and created_by is not distinct from new.created_by
        and confirmed_at = new.confirmed_at
        and status = 'CONFIRMED'
      order by id limit 1;
    if v_first is distinct from new.id then
      return null;
    end if;

    select count(*), min(start_time), max(end_time) into v_n, v_start, v_end
      from public.bookings
      where team_id = new.team_id
        and created_by is not distinct from new.created_by
        and confirmed_at = new.confirmed_at
        and status = 'CONFIRMED';

    select name into v_team from public.teams where id = new.team_id;

    perform public.fn_notify_admins(
      'SLOT_BOOKED',
      'New slot booking',
      v_team || ' booked ' || case when v_n > 1 then v_n || ' slots' else 'a slot' end
        || ' on ' || to_char(new.booking_date, 'Dy DD Mon') || ', '
        || to_char(v_start, 'FMHH12:MI AM') || '–' || to_char(v_end, 'FMHH12:MI AM') || '.',
      jsonb_build_object('booking_id', new.id, 'team_id', new.team_id),
      new.created_by
    );
    return null;
  end if;

  if new.status = 'PENDING_REVIEW' then
    select id into v_first from public.bookings
      where team_id = new.team_id
        and created_by is not distinct from new.created_by
        and created_at = new.created_at
        and status = 'PENDING_REVIEW'
      order by id limit 1;
    if v_first is distinct from new.id then
      return null;
    end if;

    select count(*), min(start_time), max(end_time) into v_n, v_start, v_end
      from public.bookings
      where team_id = new.team_id
        and created_by is not distinct from new.created_by
        and created_at = new.created_at
        and status = 'PENDING_REVIEW';

    select name into v_team from public.teams where id = new.team_id;

    perform public.fn_notify_admins(
      'BOOKING_PENDING_REVIEW',
      'Booking needs review',
      v_team || ' requested ' || case when v_n > 1 then v_n || ' slots' else 'a slot' end
        || ' on ' || to_char(new.booking_date, 'Dy DD Mon') || ', '
        || to_char(v_start, 'FMHH12:MI AM') || '–' || to_char(v_end, 'FMHH12:MI AM')
        || ' -- cross-check and approve.',
      jsonb_build_object('booking_id', new.id, 'team_id', new.team_id, 'open', 'bookings'),
      new.created_by
    );
    return null;
  end if;

  return null;
exception when others then
  raise warning 'tg_notify_admin_booking_confirmed failed: %', sqlerrm;
  return null;
end;
$$;
