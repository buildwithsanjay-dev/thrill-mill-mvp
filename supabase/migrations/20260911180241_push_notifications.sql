-- Push notification delivery for membership approval + booking confirmed,
-- per explicit user scope decision (the other candidate events — join
-- requests, cancellations, chat, other admin actions — are deliberately
-- out of scope for this pass).
--
-- Architecture: pg_net's net.http_post queues an async HTTP request as part
-- of the calling transaction — if the transaction rolls back, the queued
-- request rolls back with it, so a failed booking/membership-activation
-- never fires a stray push. The request itself is delivered by a background
-- worker after commit, decoupled from the caller — a slow/failed push
-- delivery can never block or fail the financial operation it's attached
-- to. Every push also writes a public.notifications row first (the
-- previously-unpopulated in-app notification list now has a producer).
--
-- Per CLAUDE.md's Integration Rules ("Push notifications should avoid
-- putting financial/private detail in the notification body itself"),
-- every body string here is generic — no credit amounts, no rates.
--
-- Per CLAUDE.md's push provider decision, this only ever calls Expo's push
-- endpoint (exp.host) — never Firebase/FCM directly. Expo relays to FCM/
-- APNs using the credential already uploaded via `eas credentials`.

create extension if not exists pg_net;

-- ============================================================================
-- fn_send_push_notification — shared by every trigger point below. Not
-- granted to authenticated/anon — only ever called internally by other
-- SECURITY DEFINER functions, never invoked directly from the client.
-- ============================================================================

create or replace function public.fn_send_push_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  insert into public.notifications (user_id, type, title, body, data)
  values (p_user_id, p_type, p_title, p_body, p_data);

  select expo_push_token into v_token from public.profiles where id = p_user_id;
  if v_token is null then
    -- No device registered (never opened the app on a physical device,
    -- denied permission, or hasn't signed in on this build yet) — the
    -- in-app notifications row above still exists, only the push itself
    -- is skipped.
    return;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
    body := jsonb_build_object('to', v_token, 'title', p_title, 'body', p_body, 'data', p_data)
  );
end;
$$;

revoke all on function public.fn_send_push_notification(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- ============================================================================
-- fn_admin_verify_payment — notify the Team's active Host(s)/Co-host(s) on
-- membership approval. Unchanged except for the notification loop added
-- just before the final return.
-- ============================================================================

create or replace function public.fn_admin_verify_payment(
  p_payment_id uuid,
  p_external_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_membership public.team_memberships%rowtype;
  v_plan public.membership_plans%rowtype;
  v_new_balance numeric(12,2);
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_payment.status = 'VERIFIED' then
    select id into v_membership.id from public.team_memberships where payment_id = p_payment_id;
    return v_membership.id;
  end if;

  select * into v_membership from public.team_memberships
    where id = v_payment.team_membership_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_membership.status = 'ACTIVE' then
    return v_membership.id;
  end if;

  select * into v_plan from public.membership_plans where id = v_membership.plan_id;

  update public.payments
    set status = 'VERIFIED', verified_by = auth.uid(), verified_at = now(),
        external_reference = coalesce(p_external_reference, external_reference)
    where id = p_payment_id;

  update public.team_memberships
    set status = 'ACTIVE', activated_at = now(), admin_reviewed_by = auth.uid()
    where id = v_membership.id;

  update public.teams set status = 'ACTIVE'
    where id = v_membership.team_id and status = 'CREATED';

  update public.team_wallets
    set available_credits = available_credits + v_plan.credits_allocated
    where team_id = v_membership.team_id
    returning available_credits into v_new_balance;

  insert into public.wallet_ledger
    (team_id, entry_type, amount, balance_after, reference_type, reference_id, created_by, reason)
  values
    (v_membership.team_id, 'MEMBERSHIP_CREDIT', v_plan.credits_allocated, v_new_balance,
     'payment', p_payment_id, auth.uid(), 'Membership plan ' || v_plan.code || ' verified');

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, reason, before_state, after_state)
  values
    (auth.uid(), 'MEMBERSHIP_APPROVED', 'team_membership', v_membership.id, 'External payment verified',
     jsonb_build_object('status', 'PAYMENT_EXPECTED'),
     jsonb_build_object('status', 'ACTIVE', 'credits_loaded', v_plan.credits_allocated));

  perform public.fn_send_push_notification(
    tm.user_id,
    'MEMBERSHIP_APPROVED',
    'Membership Approved',
    'Your Team''s membership is now active. Open the app to see your wallet.',
    jsonb_build_object('team_id', v_membership.team_id)
  )
  from public.team_members tm
  where tm.team_id = v_membership.team_id
    and tm.team_role in ('HOST', 'CO_HOST')
    and tm.status = 'ACTIVE';

  return v_membership.id;
end;
$$;

-- ============================================================================
-- fn_confirm_booking — notify the confirming user (Host/Co-host/Admin) on
-- successful confirm. Unchanged except for one call before the final return.
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

-- ============================================================================
-- fn_confirm_multi_slot_booking — one combined notification for the whole
-- batch (not one per slot/booking row), added just before the final return.
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
