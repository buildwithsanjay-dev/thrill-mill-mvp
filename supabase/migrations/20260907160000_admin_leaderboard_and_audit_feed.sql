-- Admin dashboard round 2:
--  1. Fill audit-log gaps: TEAM_ROLE_CHANGED, BOOKING_CONFIRMED_BY_ADMIN,
--     BOOKING_CANCELLED_BY_ADMIN were sensitive Admin actions with no
--     admin_audit_logs entry (CLAUDE.md requires one for every sensitive
--     Admin action: membership approval, credit load/adjustment, role
--     change, booking override, Turf block, refund override).
--  2. fn_admin_audit_log_feed — a single server-side, joined+filterable feed
--     (actor name + resolved target name) that both the Admin dashboard's
--     "Recent Activity" (small limit) and the new Leaderboard tab's "Admin
--     Logs" view (larger limit + filters) read from, instead of a raw
--     `select * from admin_audit_logs` that only ever showed action+reason.
--  3. fn_admin_team_leaderboard — server-computed "most Turf games played"
--     ranking per Team over a rolling week/month window, for the repurposed
--     Leaderboard admin tab. Always computed live from `bookings` (not the
--     cron/admin-triggered `leaderboard_weekly` snapshot table, which the
--     member-facing leaderboard already owns and which may be stale/empty).

-- ============================================================================
-- 1a. fn_admin_set_team_role — add TEAM_ROLE_CHANGED audit log
-- ============================================================================

create or replace function public.fn_admin_set_team_role(p_team_id uuid, p_user_id uuid, p_role public.team_role)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_team_member_id uuid;
  v_old_role public.team_role;
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select team_role into v_old_role from public.team_members
    where team_id = p_team_id and user_id = p_user_id and status = 'ACTIVE';

  if p_role in ('HOST', 'CO_HOST') then
    update public.team_members
      set team_role = 'MEMBER'
      where team_id = p_team_id and status = 'ACTIVE' and team_role = p_role and user_id <> p_user_id;
  end if;

  update public.team_members
    set team_role = p_role
    where team_id = p_team_id and user_id = p_user_id and status = 'ACTIVE'
    returning id into v_team_member_id;

  if v_team_member_id is null then
    raise exception 'MEMBER_NOT_ACTIVE' using errcode = '22023';
  end if;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, reason, before_state, after_state)
  values
    (auth.uid(), 'TEAM_ROLE_CHANGED', 'team_member', v_team_member_id, null,
     jsonb_build_object('team_role', v_old_role),
     jsonb_build_object('team_role', p_role));
end;
$fn$;

-- ============================================================================
-- 1b. fn_admin_confirm_booking_for_host — add BOOKING_CONFIRMED_BY_ADMIN
--     audit log (this is the "booking override" action from CLAUDE.md: an
--     Admin confirming a booking on a Team's behalf through the same engine
--     a Host/Co-host would use).
-- ============================================================================

create or replace function public.fn_admin_confirm_booking_for_host(p_hold_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_team_id uuid;
  v_host_id uuid;
  v_booking_id uuid;
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select team_id into v_team_id from public.slot_holds where id = p_hold_id;
  if v_team_id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  select user_id into v_host_id from public.team_members
    where team_id = v_team_id and status = 'ACTIVE' and team_role = 'HOST'
    limit 1;
  if v_host_id is null then
    raise exception 'NO_ACTIVE_HOST' using errcode = '22023';
  end if;

  v_booking_id := public.fn_confirm_booking(p_hold_id, array[v_host_id]);

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, reason, before_state, after_state)
  values
    (auth.uid(), 'BOOKING_CONFIRMED_BY_ADMIN', 'booking', v_booking_id,
     'Admin-assisted booking on behalf of Host',
     null, jsonb_build_object('team_id', v_team_id, 'host_id', v_host_id));

  return v_booking_id;
end;
$fn$;

-- ============================================================================
-- 1c. fn_cancel_booking — add BOOKING_CANCELLED_BY_ADMIN audit log, but only
--     for a genuine Admin *override* (acting via fn_is_admin() on a Team
--     they are not Host/Co-host of). A Host/Co-host cancelling their own
--     Team's booking is ordinary usage, not an Admin action, and must not
--     spam the audit log.
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

  -- fn_is_team_host_or_cohost can return NULL (not false) when the caller
  -- has no team_role row for this Team at all (fn_team_role -> NULL, then
  -- `NULL in (...)` -> NULL) — coalesce so `not ...` can't silently become
  -- NULL and skip the audit-log insert below via three-valued logic.
  v_is_admin_override := public.fn_is_admin()
    and not coalesce(public.fn_is_team_host_or_cohost(v_booking.team_id), false);

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

  if v_is_admin_override then
    insert into public.admin_audit_logs
      (admin_id, action, target_type, target_id, reason, before_state, after_state)
    values
      (auth.uid(), 'BOOKING_CANCELLED_BY_ADMIN', 'booking', v_booking.id,
       coalesce(p_reason, case when v_eligible then 'Cancelled >=24h before session' else 'Cancelled <24h before session (no refund)' end),
       jsonb_build_object('status', 'CONFIRMED'),
       jsonb_build_object('status', 'CANCELLED', 'refunded', v_eligible));
  end if;

  return case when v_eligible then 'CANCELLED_REFUNDED' else 'CANCELLED_NO_REFUND' end;
end;
$$;

-- ============================================================================
-- 2. fn_admin_audit_log_feed — joined, filterable audit-log feed
-- ============================================================================

create or replace function public.fn_admin_audit_log_feed(
  p_limit integer default 20,
  p_action text default null,
  p_date_from date default null,
  p_date_to date default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 500));
  v_rows jsonb;
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    into v_rows
  from (
    select
      l.id,
      l.action,
      l.reason,
      l.created_at,
      l.target_type,
      l.target_id,
      l.admin_id,
      coalesce(ap.full_name, 'Admin') as admin_name,
      case l.target_type
        when 'team_wallet' then wteam.name
        when 'team_membership' then mteam.name
        when 'turf_slot' then coalesce(tr.name, 'Turf') || ' · ' || to_char(ts.slot_date, 'DD Mon') || ' ' ||
                              to_char(ts.start_time, 'HH12:MI AM')
        when 'team_member' then coalesce(mp.full_name, 'Member') ||
                                 case when rteam.name is not null then ' · ' || rteam.name else '' end
        when 'booking' then coalesce(bteam.name, 'Team') || ' · ' || coalesce(btr.name, 'Turf') || ' · ' ||
                             to_char(b.booking_date, 'DD Mon')
        else null
      end as target_label
    from public.admin_audit_logs l
    left join public.profiles ap on ap.id = l.admin_id
    -- team_wallet: target_id IS the team_id directly (see fn_admin_adjust_team_credits)
    left join public.teams wteam on l.target_type = 'team_wallet' and wteam.id = l.target_id
    -- team_membership: target_id is the membership row id
    left join public.team_memberships tm on l.target_type = 'team_membership' and tm.id = l.target_id
    left join public.teams mteam on mteam.id = tm.team_id
    -- turf_slot: target_id is the slot id
    left join public.turf_slots ts on l.target_type = 'turf_slot' and ts.id = l.target_id
    left join public.turf_resources tr on tr.id = ts.turf_id
    -- team_member: target_id is the team_members row id (unambiguous team+user)
    left join public.team_members rtm on l.target_type = 'team_member' and rtm.id = l.target_id
    left join public.profiles mp on mp.id = rtm.user_id
    left join public.teams rteam on rteam.id = rtm.team_id
    -- booking: target_id is the booking id
    left join public.bookings b on l.target_type = 'booking' and b.id = l.target_id
    left join public.teams bteam on bteam.id = b.team_id
    left join public.turf_resources btr on btr.id = b.turf_id
    where (p_action is null or l.action = p_action)
      and (p_date_from is null or (l.created_at at time zone 'Asia/Kolkata')::date >= p_date_from)
      and (p_date_to is null or (l.created_at at time zone 'Asia/Kolkata')::date <= p_date_to)
    order by l.created_at desc
    limit v_limit
  ) t;

  return v_rows;
end;
$$;

revoke all on function public.fn_admin_audit_log_feed(integer, text, date, date) from public, anon;
grant execute on function public.fn_admin_audit_log_feed(integer, text, date, date) to authenticated;

-- ============================================================================
-- 3. fn_admin_team_leaderboard — rolling week/month "games played" ranking
-- ============================================================================

create or replace function public.fn_admin_team_leaderboard(p_range text default 'week')
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_range text := lower(coalesce(p_range, 'week'));
  v_days integer := case v_range when 'month' then 30 else 7 end;
  v_end date := (now() at time zone 'Asia/Kolkata')::date;
  v_start date := v_end - (v_days - 1);
  v_rows jsonb;
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_range not in ('week', 'month') then
    v_range := 'week';
    v_days := 7;
    v_start := v_end - 6;
  end if;

  select coalesce(jsonb_agg(row_to_json(t) order by t.games_played desc, t.team_name asc), '[]'::jsonb)
    into v_rows
  from (
    select
      tm.id as team_id,
      tm.name as team_name,
      count(b.id) as games_played,
      rank() over (order by count(b.id) desc) as rank
    from public.teams tm
    left join public.bookings b
      on b.team_id = tm.id
     and b.status = 'COMPLETED'
     and b.booking_date between v_start and v_end
    where tm.status = 'ACTIVE'
    group by tm.id, tm.name
  ) t;

  return jsonb_build_object(
    'range', v_range,
    'range_start', to_char(v_start, 'YYYY-MM-DD'),
    'range_end', to_char(v_end, 'YYYY-MM-DD'),
    'teams', coalesce(v_rows, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.fn_admin_team_leaderboard(text) from public, anon;
grant execute on function public.fn_admin_team_leaderboard(text) to authenticated;
