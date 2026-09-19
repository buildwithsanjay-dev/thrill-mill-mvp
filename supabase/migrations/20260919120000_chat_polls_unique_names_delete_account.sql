-- Owner feedback round (2026-09-19), backend half. Five independent pieces,
-- kept in one migration because the client ships them together:
--   1. Team names are unique (case-insensitive) among non-archived teams.
--   2. Phone numbers are valid (+91 + 10 digits, first digit 6-9) and unique.
--   3. Team chat accepts free text (was preset-only) and Host/Co-host polls.
--   4. Holding a slot that has already started is rejected with SLOT_IN_PAST.
--   5. Users can delete their own account (anonymise + revoke sign-in; the
--      financial/booking history is kept, per CLAUDE.md's soft-state rule).

-- ============================================================================
-- 1. Unique team names
-- ============================================================================
-- A user's own unfinished draft (status CREATED, no membership request yet —
-- see fn_abandon_team_creation) must not lock the name against them if they
-- quit the wizard and start over, so the guard trigger discards it first.
create or replace function public.tg_teams_name_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from 'ARCHIVED' then
    delete from public.teams t
    where t.created_by is not distinct from new.created_by
      and t.status = 'CREATED'
      and lower(btrim(t.name)) = lower(btrim(new.name))
      and not exists (select 1 from public.team_memberships tm where tm.team_id = t.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_teams_name_guard on public.teams;
create trigger trg_teams_name_guard
  before insert on public.teams
  for each row execute function public.tg_teams_name_guard();

create unique index if not exists uq_teams_name_active
  on public.teams (lower(btrim(name)))
  where status <> 'ARCHIVED';

create or replace function public.fn_is_team_name_available(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.teams t
    where lower(btrim(t.name)) = lower(btrim(p_name))
      and t.status <> 'ARCHIVED'
      and not (
        t.created_by is not distinct from auth.uid()
        and t.status = 'CREATED'
        and not exists (select 1 from public.team_memberships tm where tm.team_id = t.id)
      )
  );
$$;

revoke execute on function public.fn_is_team_name_available(text) from public, anon;
grant execute on function public.fn_is_team_name_available(text) to authenticated;

-- ============================================================================
-- 2. Valid + unique phone numbers
-- ============================================================================
-- Legacy rows (a couple of malformed test numbers) must keep working, so the
-- format rule lives in a trigger that only fires when the phone actually
-- changes, not in a table CHECK that would block every later update.
create or replace function public.tg_profiles_validate_phone()
returns trigger
language plpgsql
as $$
begin
  if new.phone is not null and btrim(new.phone) = '' then
    new.phone := null;
  end if;
  if new.phone is not null
     and (tg_op = 'INSERT' or new.phone is distinct from old.phone)
     and new.phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_validate_phone on public.profiles;
create trigger trg_profiles_validate_phone
  before insert or update of phone on public.profiles
  for each row execute function public.tg_profiles_validate_phone();

create unique index if not exists uq_profiles_phone
  on public.profiles (phone)
  where phone is not null and phone <> '';

create or replace function public.fn_is_phone_available(p_phone text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles p
    where p.phone = p_phone and p.id is distinct from auth.uid()
  );
$$;

revoke execute on function public.fn_is_phone_available(text) from public, anon;
grant execute on function public.fn_is_phone_available(text) to authenticated;

-- ============================================================================
-- 3. Team chat: free text + polls
-- ============================================================================
-- This reverses the earlier "preset-only, no freeform text" design
-- (20260911045800_team_chat_preset_messages_and_reactions.sql) on the
-- owner's explicit request: the preset chips stay as quick replies, but
-- members can now type. Exactly one of preset_key / body / poll_id is set.
alter table public.chat_messages
  alter column preset_key drop not null,
  add column body text check (body is null or char_length(btrim(body)) between 1 and 1000),
  add column poll_id uuid;

alter table public.chat_messages
  add constraint chk_chat_message_single_kind check (
    (preset_key is not null)::int + (body is not null)::int + (poll_id is not null)::int = 1
  );

-- Members may post text/presets directly; polls are created only through
-- fn_create_chat_poll (Host/Co-host check), so a direct insert may not
-- attach a poll_id.
drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and poll_id is null
    and exists (
      select 1 from public.chat_rooms r
      where r.id = chat_messages.room_id and public.fn_is_team_member(r.team_id)
    )
  );

create table public.chat_polls (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  question text not null check (char_length(btrim(question)) between 3 and 200),
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.chat_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.chat_polls(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  sort_order integer not null
);

create table public.chat_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.chat_polls(id) on delete cascade,
  option_id uuid not null references public.chat_poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (poll_id, user_id)
);

alter table public.chat_messages
  add constraint fk_chat_messages_poll foreign key (poll_id) references public.chat_polls(id);

create index ix_chat_poll_options_poll on public.chat_poll_options (poll_id, sort_order);
create index ix_chat_poll_votes_poll on public.chat_poll_votes (poll_id);
create index ix_chat_polls_room on public.chat_polls (room_id);

alter table public.chat_polls enable row level security;
alter table public.chat_poll_options enable row level security;
alter table public.chat_poll_votes enable row level security;

create policy chat_polls_select on public.chat_polls
  for select to authenticated
  using (
    public.fn_is_admin() or exists (
      select 1 from public.chat_rooms r
      where r.id = chat_polls.room_id and public.fn_is_team_member(r.team_id)
    )
  );

create policy chat_poll_options_select on public.chat_poll_options
  for select to authenticated
  using (
    public.fn_is_admin() or exists (
      select 1 from public.chat_polls p
      join public.chat_rooms r on r.id = p.room_id
      where p.id = chat_poll_options.poll_id and public.fn_is_team_member(r.team_id)
    )
  );

-- Members only ever read their OWN vote row directly; everyone else's votes
-- are exposed as counts through fn_chat_poll_results. Admin may read all
-- (the owner wants Admin to see who voted what).
create policy chat_poll_votes_select on public.chat_poll_votes
  for select to authenticated
  using (user_id = auth.uid() or public.fn_is_admin());

-- No client writes to any poll table: create/vote go through the RPCs below.

create or replace function public.fn_create_chat_poll(
  p_room_id uuid,
  p_question text,
  p_options text[],
  p_closes_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_team_name text;
  v_poll_id uuid;
  v_options text[];
  v_member record;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  select r.team_id, t.name into v_team_id, v_team_name
    from public.chat_rooms r join public.teams t on t.id = r.team_id
    where r.id = p_room_id;
  if v_team_id is null then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.fn_is_team_host_or_cohost(v_team_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select array_agg(distinct btrim(o)) into v_options
    from unnest(p_options) as o where btrim(o) <> '';

  if p_question is null or char_length(btrim(p_question)) < 3
     or v_options is null or array_length(v_options, 1) < 2 or array_length(v_options, 1) > 6 then
    raise exception 'INVALID_POLL' using errcode = '22023';
  end if;
  if p_closes_at is not null and p_closes_at <= now() then
    raise exception 'INVALID_POLL' using errcode = '22023';
  end if;

  insert into public.chat_polls (room_id, created_by, question, closes_at)
  values (p_room_id, auth.uid(), btrim(p_question), p_closes_at)
  returning id into v_poll_id;

  -- Preserve the order the Host typed them in (array_agg(distinct) sorts),
  -- de-duplicated case-sensitively on the trimmed label.
  insert into public.chat_poll_options (poll_id, label, sort_order)
  select v_poll_id, o.label, o.ord
  from (
    select btrim(x.label) as label, min(x.ord) as ord
    from unnest(p_options) with ordinality as x(label, ord)
    where btrim(x.label) <> ''
    group by btrim(x.label)
  ) o
  order by o.ord
  limit 6;

  insert into public.chat_messages (room_id, sender_id, poll_id)
  values (p_room_id, auth.uid(), v_poll_id);

  for v_member in
    select user_id from public.team_members
    where team_id = v_team_id and status = 'ACTIVE' and user_id <> auth.uid()
  loop
    perform public.fn_send_push_notification(
      v_member.user_id,
      'TEAM_POLL',
      'New poll in ' || v_team_name,
      'Tap to open the team chat and vote.',
      jsonb_build_object('team_id', v_team_id)
    );
  end loop;

  return v_poll_id;
end;
$$;

create or replace function public.fn_vote_chat_poll(p_poll_id uuid, p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.chat_polls%rowtype;
  v_team_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  select * into v_poll from public.chat_polls where id = p_poll_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  select team_id into v_team_id from public.chat_rooms where id = v_poll.room_id;
  if not public.fn_is_team_member(v_team_id) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_poll.closes_at is not null and v_poll.closes_at <= now() then
    raise exception 'POLL_CLOSED' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.chat_poll_options where id = p_option_id and poll_id = p_poll_id
  ) then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.chat_poll_votes (poll_id, option_id, user_id)
  values (p_poll_id, p_option_id, auth.uid())
  on conflict (poll_id, user_id)
  do update set option_id = excluded.option_id, updated_at = now();
end;
$$;

-- Live counts for every option of the requested polls. voter_names is only
-- populated for an Admin; a regular member gets counts and their own vote.
create or replace function public.fn_chat_poll_results(p_poll_ids uuid[])
returns table (
  poll_id uuid,
  option_id uuid,
  vote_count bigint,
  i_voted boolean,
  voter_names text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.poll_id,
    o.id as option_id,
    count(v.id) as vote_count,
    coalesce(bool_or(v.user_id = auth.uid()), false) as i_voted,
    case when public.fn_is_admin()
      then array_remove(array_agg(pr.full_name order by v.created_at), null)
      else null
    end as voter_names
  from public.chat_poll_options o
  join public.chat_polls p on p.id = o.poll_id
  join public.chat_rooms r on r.id = p.room_id
  left join public.chat_poll_votes v on v.option_id = o.id
  left join public.profiles pr on pr.id = v.user_id
  where o.poll_id = any(p_poll_ids)
    and (public.fn_is_admin() or public.fn_is_team_member(r.team_id))
  group by o.poll_id, o.id, o.sort_order
  order by o.poll_id, o.sort_order;
$$;

revoke execute on function public.fn_create_chat_poll(uuid, text, text[], timestamptz) from public, anon;
revoke execute on function public.fn_vote_chat_poll(uuid, uuid) from public, anon;
revoke execute on function public.fn_chat_poll_results(uuid[]) from public, anon;
grant execute on function public.fn_create_chat_poll(uuid, text, text[], timestamptz) to authenticated;
grant execute on function public.fn_vote_chat_poll(uuid, uuid) to authenticated;
grant execute on function public.fn_chat_poll_results(uuid[]) to authenticated;

-- ============================================================================
-- 4. fn_create_slot_hold: reject slots that have already started
-- ============================================================================
-- Same body as 20260913140000_admin_archive_team.sql (TEAM_ARCHIVED guard,
-- stale-hold self-heal with the `sh` alias fix) plus SLOT_IN_PAST. The
-- client already greys these out; this is the server-side backstop that
-- lets the app say *why* instead of a vague failure.
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

  if exists (select 1 from public.teams where id = p_team_id and status = 'ARCHIVED') then
    raise exception 'TEAM_ARCHIVED' using errcode = '22023';
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

  if ((v_slot.slot_date + v_slot.start_time) at time zone 'Asia/Kolkata') <= now() then
    raise exception 'SLOT_IN_PAST' using errcode = '22023';
  end if;

  if v_slot.status = 'HELD' then
    update public.slot_holds sh
      set status = 'EXPIRED'
      where sh.slot_id = p_slot_id and sh.status = 'ACTIVE' and sh.expires_at < now();
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
-- 5. Delete my account
-- ============================================================================
-- Not a hard delete: wallet_ledger / bookings / payments / audit rows
-- reference profiles(id) and must never be silently erased (CLAUDE.md), so
-- the account is anonymised and its sign-in revoked instead. The Host of a
-- live Team must hand the Team over first, otherwise its wallet is orphaned.
create or replace function public.fn_delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_draft record;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles where id = v_uid and platform_role = 'ADMIN') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  -- Unfinished Team drafts (never reached a membership request) vanish with
  -- the account, same rule as fn_abandon_team_creation.
  for v_draft in
    select t.id from public.teams t
    where t.created_by = v_uid and t.status = 'CREATED'
      and not exists (select 1 from public.team_memberships tm where tm.team_id = t.id)
  loop
    delete from public.teams where id = v_draft.id;
  end loop;

  if exists (
    select 1 from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = v_uid and tm.team_role = 'HOST' and tm.status = 'ACTIVE'
      and t.status <> 'ARCHIVED'
  ) then
    raise exception 'HOST_MUST_TRANSFER' using errcode = '22023';
  end if;

  update public.team_members
    set status = 'LEFT', removed_at = now()
    where user_id = v_uid and status in ('ACTIVE', 'PENDING', 'INVITED');

  update public.chat_messages set is_deleted = true where sender_id = v_uid;
  delete from public.chat_message_reactions where user_id = v_uid;
  delete from public.chat_room_reads where user_id = v_uid;
  delete from public.notifications where user_id = v_uid;

  update public.profiles
    set full_name = 'Deleted user', phone = null, avatar_url = null, expo_push_token = null
    where id = v_uid;

  -- Revoke sign-in: drop the Google identity (so the same Google account
  -- would start a brand-new account), kill sessions, scrub contact details
  -- and ban the auth user.
  delete from auth.identities where user_id = v_uid;
  delete from auth.sessions where user_id = v_uid;
  update auth.users
    set email = 'deleted-' || v_uid || '@deleted.invalid',
        phone = null,
        raw_user_meta_data = '{}'::jsonb,
        raw_app_meta_data = '{}'::jsonb,
        banned_until = now() + interval '100 years'
    where id = v_uid;
end;
$$;

revoke execute on function public.fn_delete_my_account() from public, anon;
grant execute on function public.fn_delete_my_account() to authenticated;
