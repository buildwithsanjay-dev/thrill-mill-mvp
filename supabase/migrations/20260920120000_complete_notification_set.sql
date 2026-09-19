-- Complete notification set (owner request, 2026-09-20).
--
-- Every notification below goes through fn_send_push_notification, which
-- ALWAYS writes the in-app notification row (the bell list) and then pushes
-- to the phone — so the in-app and push versions can never disagree.
--
-- Most are database TRIGGERS rather than edits to the big booking/join RPCs:
-- the events (a participant row added, a booking flipping to CANCELLED, a
-- membership request row inserted, a team_members status change) happen in
-- exactly one place each, so a trigger fires no matter which RPC caused it
-- and the RPC bodies stay untouched. Each trigger is wrapped so a
-- notification problem can never fail the real operation.

-- ============================================================================
-- 0. Push payload: high priority, default sound, the app's Android channel
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
    return;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
    body := jsonb_build_object(
      'to', v_token,
      'title', p_title,
      'body', p_body,
      'data', p_data,
      'sound', 'default',
      'priority', 'high',
      'channelId', 'default'
    )
  );
exception when others then
  -- Best-effort by design: a notification/push failure must never abort the
  -- transaction this is called from.
  raise warning 'fn_send_push_notification failed for user %, type %: %', p_user_id, p_type, sqlerrm;
end;
$$;

revoke all on function public.fn_send_push_notification(uuid, text, text, text, jsonb) from public, anon, authenticated;

-- ============================================================================
-- Helpers
-- ============================================================================
create or replace function public.fn_fmt_when(p_date date, p_time time)
returns text
language sql
stable
as $$
  select to_char(p_date, 'Dy DD Mon') || ' at ' || to_char(p_time, 'FMHH12:MI AM');
$$;

-- Fan a notification out to every platform Admin (optionally skipping the
-- Admin who caused it). Tagged audience=ADMIN so the app opens Admin screens.
create or replace function public.fn_notify_admins(
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_exclude uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin record;
begin
  for v_admin in
    select id from public.profiles
    where platform_role = 'ADMIN' and id is distinct from p_exclude
  loop
    perform public.fn_send_push_notification(
      v_admin.id, p_type, p_title, p_body, p_data || jsonb_build_object('audience', 'ADMIN')
    );
  end loop;
end;
$$;

create or replace function public.fn_notify_team_invite(p_user uuid, p_team uuid, p_invited_by uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team text;
  v_inviter text;
begin
  select name into v_team from public.teams where id = p_team;
  select full_name into v_inviter from public.profiles where id = p_invited_by;
  perform public.fn_send_push_notification(
    p_user,
    'TEAM_INVITE',
    'New team invite',
    coalesce(v_inviter, 'Someone') || ' invited you to join ' || v_team || '. Tap to respond.',
    jsonb_build_object('open', 'home', 'team_id_invited', p_team)
  );
end;
$$;

revoke all on function public.fn_fmt_when(date, time) from public, anon;
revoke all on function public.fn_notify_admins(text, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.fn_notify_team_invite(uuid, uuid, uuid) from public, anon, authenticated;

-- ============================================================================
-- 1. Added to a booking  (customer)
-- ============================================================================
create or replace function public.tg_notify_participant_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b public.bookings%rowtype;
  v_team text;
begin
  if tg_op = 'UPDATE' and (old.status is not distinct from new.status or new.status <> 'SELECTED') then
    return new;
  end if;
  -- The person who booked and put themselves on the sheet already knows.
  if new.user_id is not distinct from new.added_by then
    return new;
  end if;

  select * into v_b from public.bookings where id = new.booking_id;
  if not found or v_b.status not in ('CONFIRMED', 'IN_PROGRESS') then
    return new;
  end if;

  -- A multi-slot booking inserts one participant row per slot in the same
  -- transaction (same now()); tell each person once, not once per slot.
  if exists (
    select 1 from public.notifications n
    where n.user_id = new.user_id and n.type = 'ADDED_TO_BOOKING'
      and n.created_at = now() and n.data ->> 'team_id' = v_b.team_id::text
  ) then
    return new;
  end if;

  select name into v_team from public.teams where id = v_b.team_id;
  perform public.fn_send_push_notification(
    new.user_id,
    'ADDED_TO_BOOKING',
    'Added to a booking',
    'You''re playing on ' || public.fn_fmt_when(v_b.booking_date, v_b.start_time) || ' with ' || v_team || '. Tap to view.',
    jsonb_build_object('booking_id', v_b.id, 'team_id', v_b.team_id)
  );
  return new;
exception when others then
  raise warning 'tg_notify_participant_added failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_participant_added on public.booking_participants;
create trigger trg_notify_participant_added
  after insert or update of status on public.booking_participants
  for each row execute function public.tg_notify_participant_added();

-- ============================================================================
-- 2. Booking cancelled
--    by the Admin -> the team's Host/Co-host and players
--    by a Host    -> the Admins (and the team's other Host/Co-host/players)
-- ============================================================================
create or replace function public.tg_notify_booking_cancelled()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_admin boolean;
  v_actor_name text;
  v_team text;
  v_when text;
  v_rec record;
begin
  if v_actor is null then
    return new; -- system-driven, not a person's action
  end if;

  v_actor_admin := public.fn_is_admin();
  select name into v_team from public.teams where id = new.team_id;
  select full_name into v_actor_name from public.profiles where id = v_actor;
  v_when := to_char(new.booking_date, 'Dy DD Mon');

  for v_rec in
    select distinct r.u as user_id
    from (
      select tm.user_id as u from public.team_members tm
        where tm.team_id = new.team_id and tm.status = 'ACTIVE' and tm.team_role in ('HOST', 'CO_HOST')
      union
      select bp.user_id as u from public.booking_participants bp
        where bp.booking_id = new.id and bp.status <> 'REMOVED'
    ) r
    where r.u <> v_actor
  loop
    perform public.fn_send_push_notification(
      v_rec.user_id,
      'BOOKING_CANCELLED',
      'Booking cancelled',
      case when v_actor_admin
        then 'Your booking on ' || v_when || ' was cancelled by the club. Tap to see the details.'
        else v_team || '''s booking on ' || v_when || ' was cancelled by ' || coalesce(v_actor_name, 'the Host') || '. Tap to see the details.'
      end,
      jsonb_build_object('booking_id', new.id, 'team_id', new.team_id)
    );
  end loop;

  if not v_actor_admin then
    perform public.fn_notify_admins(
      'BOOKING_CANCELLED',
      'Booking cancelled by a team',
      v_team || ' cancelled a booking on ' || v_when || '.',
      jsonb_build_object('booking_id', new.id, 'team_id', new.team_id),
      v_actor
    );
  end if;
  return new;
exception when others then
  raise warning 'tg_notify_booking_cancelled failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_booking_cancelled on public.bookings;
create trigger trg_notify_booking_cancelled
  after update of status on public.bookings
  for each row
  when (new.status = 'CANCELLED' and old.status is distinct from 'CANCELLED')
  execute function public.tg_notify_booking_cancelled();

-- ============================================================================
-- 3. New membership request -> Admins. Also delivers any team invites that
--    were made during Create Team (held back until the team is real, so an
--    abandoned draft never sends an orphan invite).
-- ============================================================================
create or replace function public.tg_notify_membership_requested()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team text;
  v_price integer;
  v_inv record;
begin
  if new.status <> 'REQUEST_SUBMITTED' then
    return new;
  end if;
  select name into v_team from public.teams where id = new.team_id;
  select price_inr into v_price from public.membership_plans where id = new.plan_id;

  perform public.fn_notify_admins(
    'MEMBERSHIP_REQUESTED',
    'New membership request',
    v_team || ' has requested the ₹' || to_char(v_price, 'FM999,999') || ' membership plan. Review and verify payment.',
    jsonb_build_object('team_id', new.team_id, 'membership_id', new.id),
    new.requested_by
  );

  for v_inv in
    select user_id, invited_by from public.team_members
    where team_id = new.team_id and status = 'INVITED'
  loop
    perform public.fn_notify_team_invite(v_inv.user_id, new.team_id, v_inv.invited_by);
  end loop;
  return new;
exception when others then
  raise warning 'tg_notify_membership_requested failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_membership_requested on public.team_memberships;
create trigger trg_notify_membership_requested
  after insert on public.team_memberships
  for each row execute function public.tg_notify_membership_requested();

-- ============================================================================
-- 4. Team members: join request approved / declined, and new team invite
-- ============================================================================
create or replace function public.tg_notify_team_member_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team text;
begin
  select name into v_team from public.teams where id = new.team_id;

  if tg_op = 'UPDATE' and old.status = 'PENDING' and new.status = 'ACTIVE' then
    perform public.fn_send_push_notification(
      new.user_id, 'JOIN_REQUEST_APPROVED', 'Join request approved',
      'You''re now part of ' || v_team || '. Tap to open the team.',
      jsonb_build_object('team_id', new.team_id)
    );
  elsif tg_op = 'UPDATE' and old.status = 'PENDING' and new.status = 'REJECTED' then
    perform public.fn_send_push_notification(
      new.user_id, 'JOIN_REQUEST_REJECTED', 'Join request declined',
      'Your request to join ' || v_team || ' wasn''t approved.',
      jsonb_build_object('open', 'home')
    );
  elsif new.status = 'INVITED' and (tg_op = 'INSERT' or old.status is distinct from 'INVITED') then
    if exists (select 1 from public.team_memberships where team_id = new.team_id) then
      perform public.fn_notify_team_invite(new.user_id, new.team_id, new.invited_by);
    end if;
  end if;
  return new;
exception when others then
  raise warning 'tg_notify_team_member_change failed: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_notify_team_member_change on public.team_members;
create trigger trg_notify_team_member_change
  after insert or update of status on public.team_members
  for each row execute function public.tg_notify_team_member_change();

-- ============================================================================
-- 5. Slot bookings confirmed -> Admins. A DEFERRED constraint trigger: it runs
--    at commit, when every slot of a multi-slot booking exists, so the Admin
--    gets ONE message with the slot count and time range.
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
  if new.status <> 'CONFIRMED' then
    return null;
  end if;

  select id into v_first from public.bookings
    where team_id = new.team_id
      and created_by is not distinct from new.created_by
      and confirmed_at = new.confirmed_at
      and status = 'CONFIRMED'
    order by id limit 1;
  if v_first is distinct from new.id then
    return null; -- another row of the same batch sends the one message
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
exception when others then
  raise warning 'tg_notify_admin_booking_confirmed failed: %', sqlerrm;
  return null;
end;
$$;

drop trigger if exists trg_notify_admin_booking_confirmed on public.bookings;
create constraint trigger trg_notify_admin_booking_confirmed
  after insert on public.bookings
  deferrable initially deferred
  for each row execute function public.tg_notify_admin_booking_confirmed();

-- ============================================================================
-- 6. Membership needs attention / payment not received -> the team's
--    Host/Co-host. An explicit Admin action (there was no way to say "this
--    payment hasn't arrived" before); audited like every sensitive Admin act.
-- ============================================================================
create or replace function public.fn_admin_flag_membership_issue(
  p_membership_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_m public.team_memberships%rowtype;
  v_team text;
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_m from public.team_memberships where id = p_membership_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_m.status = 'ACTIVE' then
    raise exception 'MEMBERSHIP_ALREADY_ACTIVE' using errcode = '22023';
  end if;

  select name into v_team from public.teams where id = v_m.team_id;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, reason, before_state, after_state)
  values
    (auth.uid(), 'MEMBERSHIP_PAYMENT_FLAGGED', 'team_membership', v_m.id, p_reason,
     jsonb_build_object('status', v_m.status), jsonb_build_object('status', v_m.status, 'flagged', true));

  perform public.fn_send_push_notification(
    tm.user_id,
    'MEMBERSHIP_NEEDS_ATTENTION',
    'Membership needs attention',
    'Your membership request for ' || v_team || ' needs attention. The Admin will contact you.',
    jsonb_build_object('team_id', v_m.team_id)
  )
  from public.team_members tm
  where tm.team_id = v_m.team_id and tm.team_role in ('HOST', 'CO_HOST') and tm.status = 'ACTIVE';
end;
$$;

revoke execute on function public.fn_admin_flag_membership_issue(uuid, text) from public, anon;
grant execute on function public.fn_admin_flag_membership_issue(uuid, text) to authenticated;

-- ============================================================================
-- 7. Game reminder, ~2 hours before -> the players (and whoever booked)
-- ============================================================================
alter table public.bookings add column if not exists reminder_sent_at timestamptz;

create or replace function public.fn_send_session_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_b record;
  v_u record;
  v_count integer := 0;
begin
  for v_b in
    select b.id, b.team_id, b.created_by
    from public.bookings b
    where b.status = 'CONFIRMED'
      and b.reminder_sent_at is null
      and ((b.booking_date + b.start_time) at time zone 'Asia/Kolkata')
          between now() + interval '1 hour 55 minutes' and now() + interval '2 hours 5 minutes'
  loop
    update public.bookings set reminder_sent_at = now() where id = v_b.id;

    for v_u in
      select distinct r.u
      from (
        select bp.user_id as u from public.booking_participants bp
          where bp.booking_id = v_b.id and bp.status <> 'REMOVED'
        union
        select v_b.created_by
      ) r
      where r.u is not null
        and not exists (select 1 from public.profiles p where p.id = r.u and p.platform_role = 'ADMIN')
    loop
      perform public.fn_send_push_notification(
        v_u.u,
        'GAME_REMINDER',
        'Game reminder',
        'Your game at Thrill Mill starts in 2 hours. Tap to view details.',
        jsonb_build_object('booking_id', v_b.id, 'team_id', v_b.team_id)
      );
    end loop;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.fn_send_session_reminders() from public, anon, authenticated;

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'session-reminders') then
    perform cron.unschedule('session-reminders');
  end if;
end $$;

select cron.schedule(
  'session-reminders',
  '*/5 * * * *',
  $$select public.fn_send_session_reminders();$$
);
