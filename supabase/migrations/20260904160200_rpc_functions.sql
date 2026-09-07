-- Thrill Mill Club — RPC functions
--
-- Every function here is SECURITY DEFINER: it bypasses RLS internally but
-- re-derives the caller's identity from auth.uid() and independently checks
-- authorization + business rules before writing anything — the client never
-- supplies user_id, role, price, or availability as trusted input.
--
-- Errors are raised as exceptions whose MESSAGE is the structured business
-- code from CLAUDE.md's API Conventions (INSUFFICIENT_CREDITS, SLOT_UNAVAILABLE,
-- HOLD_EXPIRED, MEMBERSHIP_INACTIVE, CANCELLATION_NOT_ALLOWED, PAYMENT_PENDING,
-- UNAUTHORIZED, FORBIDDEN, ...) — the client maps postgrest's error.message to
-- these codes rather than showing raw DB errors.

-- ============================================================================
-- fn_create_team — Member creates own Team, or Admin creates on behalf of a
-- customer (same object/rules either way, per product-spec §3.2).
-- ============================================================================

create or replace function public.fn_create_team(
  p_name text,
  p_host_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid := coalesce(p_host_user_id, auth.uid());
  v_team_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  if p_host_user_id is not null and p_host_user_id <> auth.uid() and not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'INVALID_TEAM_NAME' using errcode = '22023';
  end if;

  insert into public.teams (name, status, created_by)
  values (trim(p_name), 'CREATED', auth.uid())
  returning id into v_team_id;

  insert into public.team_members (team_id, user_id, team_role, status, invited_by, joined_at)
  values (v_team_id, v_host, 'HOST', 'ACTIVE', auth.uid(), now());

  insert into public.team_wallets (team_id) values (v_team_id);
  insert into public.chat_rooms (team_id) values (v_team_id);

  return v_team_id;
end;
$$;

-- ============================================================================
-- Team member management
-- ============================================================================

create or replace function public.fn_invite_team_member(
  p_team_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not (public.fn_is_team_host_or_cohost(p_team_id) or public.fn_is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.team_members (team_id, user_id, team_role, status, invited_by)
  values (p_team_id, p_user_id, 'MEMBER', 'INVITED', auth.uid())
  on conflict (team_id, user_id) do update
    set status = 'INVITED', invited_by = auth.uid(), updated_at = now()
    where public.team_members.status in ('REJECTED', 'LEFT', 'REMOVED')
  returning id into v_id;

  if v_id is null then
    raise exception 'MEMBER_ALREADY_ON_TEAM' using errcode = '23505';
  end if;

  return v_id;
end;
$$;

create or replace function public.fn_respond_to_team_invite(
  p_team_member_id uuid,
  p_accept boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.team_members%rowtype;
begin
  select * into v_row from public.team_members where id = p_team_member_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_row.user_id <> auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_row.status <> 'INVITED' then
    raise exception 'INVITE_NOT_PENDING' using errcode = '22023';
  end if;

  if p_accept then
    update public.team_members
      set status = 'ACTIVE', joined_at = now()
      where id = p_team_member_id;
  else
    update public.team_members
      set status = 'REJECTED'
      where id = p_team_member_id;
  end if;
end;
$$;

create or replace function public.fn_assign_co_host(
  p_team_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.fn_team_role(p_team_id) = 'HOST' or public.fn_is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- demote any existing co-host first (at most one active co-host)
  update public.team_members
    set team_role = 'MEMBER'
    where team_id = p_team_id and status = 'ACTIVE' and team_role = 'CO_HOST';

  update public.team_members
    set team_role = 'CO_HOST'
    where team_id = p_team_id and user_id = p_user_id and status = 'ACTIVE';

  if not found then
    raise exception 'MEMBER_NOT_ACTIVE' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.fn_remove_team_member(
  p_team_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.team_members%rowtype;
begin
  select * into v_row from public.team_members where id = p_team_member_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_row.team_role = 'HOST' then
    raise exception 'CANNOT_REMOVE_HOST' using errcode = '22023';
  end if;
  if not (public.fn_is_team_host_or_cohost(v_row.team_id) or public.fn_is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.team_members
    set status = 'REMOVED', removed_at = now()
    where id = p_team_member_id;
end;
$$;

create or replace function public.fn_leave_team(
  p_team_member_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.team_members%rowtype;
begin
  select * into v_row from public.team_members where id = p_team_member_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_row.user_id <> auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_row.team_role = 'HOST' then
    raise exception 'HOST_CANNOT_LEAVE' using errcode = '22023';
  end if;

  update public.team_members set status = 'LEFT' where id = p_team_member_id;
end;
$$;

-- ============================================================================
-- fn_request_team_membership — plan selection + submission to Admin
-- ============================================================================

create or replace function public.fn_request_team_membership(
  p_team_id uuid,
  p_plan_code text,
  p_host_phone text,
  p_co_host_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.membership_plans%rowtype;
  v_membership_id uuid;
  v_payment_id uuid;
begin
  if not (public.fn_team_role(p_team_id) = 'HOST' or public.fn_is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_plan from public.membership_plans
    where code = p_plan_code and is_active = true;
  if not found then
    raise exception 'INVALID_PLAN' using errcode = '22023';
  end if;

  insert into public.team_memberships
    (team_id, plan_id, status, requested_by, host_phone, co_host_phone)
  values
    (p_team_id, v_plan.id, 'REQUEST_SUBMITTED', auth.uid(), p_host_phone, p_co_host_phone)
  returning id into v_membership_id;

  insert into public.payments (team_membership_id, amount_inr, status)
  values (v_membership_id, v_plan.price_inr, 'PAYMENT_EXPECTED')
  returning id into v_payment_id;

  update public.team_memberships set payment_id = v_payment_id where id = v_membership_id;

  return v_membership_id;
end;
$$;

-- ============================================================================
-- fn_admin_verify_payment — the ONLY trigger for membership activation +
-- credit allocation. Idempotent on payment_id: a repeated call after the
-- payment is already VERIFIED is a no-op, so retries can't double-allocate.
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

  -- Idempotency: already verified -> return the (already active) membership id, no side effects.
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
    -- Should not happen while payment wasn't VERIFIED, but guard idempotency anyway.
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
    set available_credits = available_credits + v_payment.amount_inr
    where team_id = v_membership.team_id
    returning available_credits into v_new_balance;

  insert into public.wallet_ledger
    (team_id, entry_type, amount, balance_after, reference_type, reference_id, created_by, reason)
  values
    (v_membership.team_id, 'MEMBERSHIP_CREDIT', v_payment.amount_inr, v_new_balance,
     'payment', p_payment_id, auth.uid(), 'Membership plan ' || v_plan.code || ' verified');

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, reason, before_state, after_state)
  values
    (auth.uid(), 'MEMBERSHIP_APPROVED', 'team_membership', v_membership.id, 'External payment verified',
     jsonb_build_object('status', 'PAYMENT_EXPECTED'),
     jsonb_build_object('status', 'ACTIVE', 'credits_loaded', v_payment.amount_inr));

  return v_membership.id;
end;
$$;

-- ============================================================================
-- fn_create_slot_hold — 1-minute server-timestamped hold
-- ============================================================================

create or replace function public.fn_create_slot_hold(
  p_slot_id uuid,
  p_team_id uuid
)
returns table (hold_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.turf_slots%rowtype;
  v_hold_id uuid;
  v_expires timestamptz;
begin
  if not (public.fn_is_team_host_or_cohost(p_team_id) or public.fn_is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.team_memberships
    where team_id = p_team_id and status = 'ACTIVE'
  ) then
    raise exception 'MEMBERSHIP_INACTIVE' using errcode = '22023';
  end if;

  select * into v_slot from public.turf_slots where id = p_slot_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Self-heal a stale hold: if HELD but its hold already expired, release it.
  if v_slot.status = 'HELD' then
    update public.slot_holds
      set status = 'EXPIRED'
      where slot_id = p_slot_id and status = 'ACTIVE' and expires_at < now();
    if found then
      v_slot.status := 'AVAILABLE';
      update public.turf_slots set status = 'AVAILABLE' where id = p_slot_id;
    end if;
  end if;

  if v_slot.status <> 'AVAILABLE' then
    raise exception 'SLOT_UNAVAILABLE' using errcode = '22023';
  end if;

  v_expires := now() + interval '1 minute';

  insert into public.slot_holds (slot_id, team_id, held_by, status, expires_at)
  values (p_slot_id, p_team_id, auth.uid(), 'ACTIVE', v_expires)
  returning id into v_hold_id;

  update public.turf_slots set status = 'HELD' where id = p_slot_id;

  return query select v_hold_id, v_expires;
end;
$$;

-- ============================================================================
-- fn_confirm_booking — the highest-risk operation. Validate -> recompute
-- price server-side -> atomic debit + ledger + confirm, all-or-nothing.
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
  v_duration_hours numeric(4,2);
  v_session_start timestamptz;
  v_discounted_used_in_window numeric(6,2);
  v_remaining_discount numeric(6,2);
  v_discounted_hours_used numeric(4,2);
  v_standard_hours_used numeric(4,2);
  v_total_credits numeric(12,2);
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

  -- All proposed participants must be active members of this team.
  for v_participant in select unnest(p_participant_user_ids) loop
    if not exists (
      select 1 from public.team_members
      where team_id = v_hold.team_id and user_id = v_participant and status = 'ACTIVE'
    ) then
      raise exception 'PARTICIPANT_INVALID' using errcode = '22023';
    end if;
  end loop;

  -- Price calculation (server-authoritative, ignores any client-sent price).
  v_duration_hours := extract(epoch from (v_slot.end_time - v_slot.start_time)) / 3600.0;
  v_session_start := (v_slot.slot_date + v_slot.start_time) at time zone 'Asia/Kolkata';

  if v_plan.discounted_hours_cap_per_24h is null then
    -- ₹25,000 plan: no cap, every hour at the membership rate.
    v_discounted_hours_used := v_duration_hours;
    v_standard_hours_used := 0;
  else
    -- ₹10,000 plan: rolling 24h window of already-consumed discounted hours,
    -- trailing back from this session's start time, counting only bookings
    -- that are live (not cancelled/expired/failed).
    select coalesce(sum(b.discounted_hours_used), 0) into v_discounted_used_in_window
      from public.bookings b
      where b.team_id = v_hold.team_id
        and b.status in ('CONFIRMED', 'IN_PROGRESS', 'COMPLETED')
        and ((b.booking_date + b.start_time) at time zone 'Asia/Kolkata') >= v_session_start - interval '24 hours'
        and ((b.booking_date + b.start_time) at time zone 'Asia/Kolkata') < v_session_start;

    v_remaining_discount := greatest(v_plan.discounted_hours_cap_per_24h - v_discounted_used_in_window, 0);
    v_discounted_hours_used := least(v_duration_hours, v_remaining_discount);
    v_standard_hours_used := v_duration_hours - v_discounted_hours_used;
  end if;

  v_total_credits := (v_discounted_hours_used * v_plan.membership_rate_per_hour)
                    + (v_standard_hours_used * v_plan.standard_rate_per_hour);

  select * into v_wallet from public.team_wallets where team_id = v_hold.team_id for update;
  if v_wallet.available_credits < v_total_credits then
    raise exception 'INSUFFICIENT_CREDITS' using errcode = '22023';
  end if;

  v_new_balance := v_wallet.available_credits - v_total_credits;
  update public.team_wallets set available_credits = v_new_balance where team_id = v_hold.team_id;

  insert into public.bookings
    (team_id, turf_id, slot_id, hold_id, status, booking_date, start_time, end_time,
     duration_hours, membership_rate_applied, standard_rate_applied,
     discounted_hours_used, standard_hours_used, total_credits, created_by, confirmed_at)
  values
    (v_hold.team_id, v_slot.turf_id, v_slot.id, v_hold.id, 'CONFIRMED', v_slot.slot_date,
     v_slot.start_time, v_slot.end_time, v_duration_hours, v_plan.membership_rate_per_hour,
     v_plan.standard_rate_per_hour, v_discounted_hours_used, v_standard_hours_used,
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

-- ============================================================================
-- fn_modify_participants — editable pre-lock (before session start) only
-- ============================================================================

create or replace function public.fn_modify_participants(
  p_booking_id uuid,
  p_add_user_ids uuid[] default '{}',
  p_remove_user_ids uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_session_start timestamptz;
  v_participant uuid;
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (public.fn_is_team_host_or_cohost(v_booking.team_id) or public.fn_is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_booking.status <> 'CONFIRMED' then
    raise exception 'PARTICIPANTS_LOCKED' using errcode = '22023';
  end if;

  v_session_start := (v_booking.booking_date + v_booking.start_time) at time zone 'Asia/Kolkata';
  if now() >= v_session_start then
    raise exception 'PARTICIPANTS_LOCKED' using errcode = '22023';
  end if;

  foreach v_participant in array p_remove_user_ids loop
    update public.booking_participants
      set status = 'REMOVED'
      where booking_id = p_booking_id and user_id = v_participant and status = 'SELECTED';
  end loop;

  foreach v_participant in array p_add_user_ids loop
    if not exists (
      select 1 from public.team_members
      where team_id = v_booking.team_id and user_id = v_participant and status = 'ACTIVE'
    ) then
      raise exception 'PARTICIPANT_INVALID' using errcode = '22023';
    end if;

    insert into public.booking_participants (booking_id, user_id, added_by)
    values (p_booking_id, v_participant, auth.uid())
    on conflict (booking_id, user_id) do update set status = 'SELECTED'
      where public.booking_participants.status = 'REMOVED';
  end loop;
end;
$$;

-- ============================================================================
-- fn_cancel_booking — server-time eligibility, atomic refund
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
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (public.fn_is_team_host_or_cohost(v_booking.team_id) or public.fn_is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_booking.status <> 'CONFIRMED' then
    raise exception 'CANCELLATION_NOT_ALLOWED' using errcode = '22023';
  end if;

  v_session_start := (v_booking.booking_date + v_booking.start_time) at time zone 'Asia/Kolkata';
  v_eligible := (v_session_start - now()) >= interval '24 hours'; -- server time, never device time

  if v_eligible then
    update public.team_wallets
      set available_credits = available_credits + v_booking.total_credits
      where team_id = v_booking.team_id
      returning available_credits into v_new_balance;

    insert into public.wallet_ledger
      (team_id, entry_type, amount, balance_after, reference_type, reference_id, created_by, reason)
    values
      (v_booking.team_id, 'BOOKING_REFUND', v_booking.total_credits, v_new_balance,
       'booking', v_booking.id, auth.uid(), coalesce(p_reason, 'Cancelled >=24h before session'));
    -- Discounted-hour allowance restoration is implicit: fn_confirm_booking's
    -- rolling-24h window only sums bookings with status in
    -- (CONFIRMED, IN_PROGRESS, COMPLETED), so a CANCELLED booking's hours no
    -- longer count against future allowance automatically.
  end if;

  update public.bookings
    set status = 'CANCELLED', cancelled_at = now(), cancellation_reason = p_reason
    where id = p_booking_id;

  update public.turf_slots set status = 'AVAILABLE' where id = v_booking.slot_id;

  return case when v_eligible then 'CANCELLED_REFUNDED' else 'CANCELLED_NO_REFUND' end;
end;
$$;

-- ============================================================================
-- fn_complete_booking — session completion -> lock participants -> usage attribution
-- ============================================================================

create or replace function public.fn_complete_booking(
  p_booking_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_participant_count integer;
  v_per_member_credits numeric(12,2);
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (public.fn_is_team_host_or_cohost(v_booking.team_id) or public.fn_is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_booking.status not in ('CONFIRMED', 'IN_PROGRESS') then
    raise exception 'INVALID_STATE_TRANSITION' using errcode = '22023';
  end if;

  update public.booking_participants
    set status = 'COMPLETED', locked_at = coalesce(locked_at, now())
    where booking_id = p_booking_id and status in ('SELECTED', 'LOCKED');

  select count(*) into v_participant_count
    from public.booking_participants
    where booking_id = p_booking_id and status = 'COMPLETED';

  if v_participant_count = 0 then
    raise exception 'NO_PARTICIPANTS' using errcode = '22023';
  end if;

  v_per_member_credits := round(v_booking.total_credits / v_participant_count, 2);

  insert into public.member_usage_attribution
    (booking_id, user_id, team_id, credits_attributed, participant_count_at_completion)
  select p_booking_id, bp.user_id, v_booking.team_id, v_per_member_credits, v_participant_count
    from public.booking_participants bp
    where bp.booking_id = p_booking_id and bp.status = 'COMPLETED'
  on conflict (booking_id, user_id) do nothing;

  update public.bookings set status = 'COMPLETED', completed_at = now() where id = p_booking_id;
end;
$$;

-- ============================================================================
-- fn_expire_stale_holds — releases holds past expiry back to AVAILABLE
-- (call periodically via pg_cron if enabled, or lazily from the client poll)
-- ============================================================================

create or replace function public.fn_expire_stale_holds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.slot_holds
      set status = 'EXPIRED'
      where status = 'ACTIVE' and expires_at < now()
      returning slot_id
  )
  update public.turf_slots
    set status = 'AVAILABLE'
    where id in (select slot_id from expired) and status = 'HELD';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================================
-- fn_admin_adjust_credits — manual credit load/adjustment (reason required)
-- ============================================================================

create or replace function public.fn_admin_adjust_credits(
  p_team_id uuid,
  p_amount numeric,
  p_reason text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wallet public.team_wallets%rowtype;
  v_new_balance numeric(12,2);
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  if p_amount = 0 then
    raise exception 'INVALID_AMOUNT' using errcode = '22023';
  end if;

  select * into v_wallet from public.team_wallets where team_id = p_team_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_wallet.available_credits + p_amount < 0 then
    raise exception 'INSUFFICIENT_CREDITS' using errcode = '22023';
  end if;

  v_new_balance := v_wallet.available_credits + p_amount;
  update public.team_wallets set available_credits = v_new_balance where team_id = p_team_id;

  insert into public.wallet_ledger
    (team_id, entry_type, amount, balance_after, reference_type, created_by, reason)
  values
    (p_team_id, 'ADMIN_ADJUSTMENT', p_amount, v_new_balance, 'admin_adjustment', auth.uid(), p_reason);

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, reason, before_state, after_state)
  values
    (auth.uid(), 'CREDIT_ADJUSTMENT', 'team_wallet', p_team_id, p_reason,
     jsonb_build_object('available_credits', v_wallet.available_credits),
     jsonb_build_object('available_credits', v_new_balance));

  return v_new_balance;
end;
$$;

-- ============================================================================
-- fn_admin_block_slot / fn_admin_unblock_slot — Turf availability control
-- ============================================================================

create or replace function public.fn_admin_block_slot(
  p_slot_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.turf_slots%rowtype;
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into v_slot from public.turf_slots where id = p_slot_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_slot.status not in ('AVAILABLE') then
    raise exception 'SLOT_UNAVAILABLE' using errcode = '22023';
  end if;

  update public.turf_slots
    set status = 'BLOCKED', blocked_reason = p_reason, blocked_by = auth.uid()
    where id = p_slot_id;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, reason, before_state, after_state)
  values
    (auth.uid(), 'TURF_SLOT_BLOCKED', 'turf_slot', p_slot_id, p_reason,
     jsonb_build_object('status', v_slot.status), jsonb_build_object('status', 'BLOCKED'));
end;
$$;

create or replace function public.fn_admin_unblock_slot(
  p_slot_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.turf_slots%rowtype;
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_slot from public.turf_slots where id = p_slot_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_slot.status <> 'BLOCKED' then
    raise exception 'INVALID_STATE_TRANSITION' using errcode = '22023';
  end if;

  update public.turf_slots
    set status = 'AVAILABLE', blocked_reason = null, blocked_by = null
    where id = p_slot_id;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, reason, before_state, after_state)
  values
    (auth.uid(), 'TURF_SLOT_UNBLOCKED', 'turf_slot', p_slot_id, null,
     jsonb_build_object('status', 'BLOCKED'), jsonb_build_object('status', 'AVAILABLE'));
end;
$$;

-- ============================================================================
-- fn_compute_weekly_leaderboard — Admin/system-triggered weekly aggregate
-- ============================================================================

create or replace function public.fn_compute_weekly_leaderboard(
  p_week_start date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week_end date := p_week_start + interval '6 days';
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  delete from public.leaderboard_weekly
    where week_start = p_week_start and scope = 'TEAM';
  insert into public.leaderboard_weekly (week_start, week_end, scope, team_id, metric_value, rank)
  select p_week_start, v_week_end, 'TEAM', b.team_id, count(*)::numeric,
         rank() over (order by count(*) desc)
    from public.bookings b
    where b.status = 'COMPLETED'
      and b.booking_date between p_week_start and v_week_end
    group by b.team_id;

  delete from public.leaderboard_weekly
    where week_start = p_week_start and scope = 'MEMBER';
  insert into public.leaderboard_weekly (week_start, week_end, scope, user_id, metric_value, rank)
  select p_week_start, v_week_end, 'MEMBER', mua.user_id, sum(mua.credits_attributed),
         rank() over (order by sum(mua.credits_attributed) desc)
    from public.member_usage_attribution mua
    join public.bookings b on b.id = mua.booking_id
    where b.status = 'COMPLETED'
      and b.booking_date between p_week_start and v_week_end
    group by mua.user_id;
end;
$$;
