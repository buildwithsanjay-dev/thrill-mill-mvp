-- Thrill Mill Club — time-banded pricing model (supersedes the flat-rate
-- pricing in the initial schema/RPC migration, per explicit product
-- direction from the user):
--
--   Membership rate: ₹450/hr (5AM–5PM)  |  ₹800/hr (5PM–midnight)
--   Standard rate:   ₹500/hr (5AM–5PM)  |  ₹1000/hr (5PM–midnight)
--
--   Both plans share these bands. Only the ₹10,000 plan has the 3-discounted-
--   hour/rolling-24h cap; the ₹25,000 plan has no cap (every hour at the
--   membership day/night rate).
--
--   Credits allocated on activation are NOT equal to the amount paid:
--     ₹10,000 plan  -> 15,000 credits
--     ₹25,000 plan  -> 40,000 credits
--
--   Turf operates 5AM–midnight only, and every slot is whole-hour aligned
--   (no slot straddles the 5PM band boundary mid-hour) — this lets pricing
--   be computed hour-by-hour without splitting a single hour across bands.

-- ----------------------------------------------------------------------------
-- 1. membership_plans: day/night rate columns + credits_allocated
-- ----------------------------------------------------------------------------

alter table public.membership_plans
  add column membership_day_rate_per_hour integer,
  add column membership_night_rate_per_hour integer,
  add column standard_day_rate_per_hour integer,
  add column standard_night_rate_per_hour integer,
  add column credits_allocated integer;

update public.membership_plans set
  membership_day_rate_per_hour = 450,
  membership_night_rate_per_hour = 800,
  standard_day_rate_per_hour = 500,
  standard_night_rate_per_hour = 1000,
  credits_allocated = case code when 'PLAN_10K' then 15000 when 'PLAN_25K' then 40000 end;

alter table public.membership_plans
  alter column membership_day_rate_per_hour set not null,
  alter column membership_night_rate_per_hour set not null,
  alter column standard_day_rate_per_hour set not null,
  alter column standard_night_rate_per_hour set not null,
  alter column credits_allocated set not null,
  add constraint chk_membership_plans_rates_positive check (
    membership_day_rate_per_hour > 0 and membership_night_rate_per_hour > 0
    and standard_day_rate_per_hour > 0 and standard_night_rate_per_hour > 0
    and credits_allocated > 0
  );

alter table public.membership_plans
  drop column membership_rate_per_hour,
  drop column standard_rate_per_hour;

-- Cap is now a whole-hour count (whole-hour slots only).
alter table public.membership_plans
  alter column discounted_hours_cap_per_24h type integer using discounted_hours_cap_per_24h::integer;

-- ----------------------------------------------------------------------------
-- 2. bookings: pricing snapshot becomes a day/night hour + rate breakdown
-- ----------------------------------------------------------------------------

alter table public.bookings
  drop column discounted_hours_used,
  drop column standard_hours_used,
  drop column membership_rate_applied,
  drop column standard_rate_applied;

alter table public.bookings
  add column membership_day_hours integer not null default 0,
  add column membership_night_hours integer not null default 0,
  add column standard_day_hours integer not null default 0,
  add column standard_night_hours integer not null default 0,
  add column membership_day_rate_applied integer,
  add column membership_night_rate_applied integer,
  add column standard_day_rate_applied integer,
  add column standard_night_rate_applied integer,
  add constraint chk_bookings_hours_match_duration check (
    membership_day_hours + membership_night_hours + standard_day_hours + standard_night_hours
      = round(duration_hours)::integer
  );

-- ----------------------------------------------------------------------------
-- 3. turf_slots: operating hours 5AM–midnight, whole-hour aligned
-- ----------------------------------------------------------------------------

alter table public.turf_slots
  add constraint chk_turf_slots_operating_hours check (
    start_time >= time '05:00:00'
    and end_time <= time '24:00:00'
    and extract(minute from start_time) = 0 and extract(second from start_time) = 0
    and extract(minute from end_time) = 0 and extract(second from end_time) = 0
  );

-- ----------------------------------------------------------------------------
-- 4. fn_confirm_booking — hour-by-hour day/night pricing + rolling-24h cap
-- ----------------------------------------------------------------------------

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
        v_total_credits := v_total_credits + v_plan.standard_night_rate_per_hour;
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
     v_plan.standard_day_rate_per_hour, v_plan.standard_night_rate_per_hour,
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

-- ----------------------------------------------------------------------------
-- 5. fn_admin_verify_payment — credit credits_allocated, not amount paid
-- ----------------------------------------------------------------------------

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

  return v_membership.id;
end;
$$;
