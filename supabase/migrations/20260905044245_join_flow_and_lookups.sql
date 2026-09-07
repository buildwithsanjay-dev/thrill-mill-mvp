-- Adds what the mobile "Add Members" / "Join a Network" screens need that
-- the original schema didn't yet cover:
--   1. teams.join_code — a short shareable code (Network Details already
--      showed a mock "ID: TM-NW-7429" in the Figma export; this makes it
--      real) used for self-service join requests.
--   2. fn_lookup_user_by_phone — profiles_select RLS intentionally only
--      lets you see your own team's members, so a Host adding a brand-new
--      member by phone number has no other way to find their user_id.
--      Returns only the minimal fields needed to show a match.
--   3. fn_lookup_team_by_join_code / fn_request_join_team /
--      fn_respond_to_join_request — the self-service join path. The
--      team_member_status enum already had a PENDING value reserved for
--      this (distinct from INVITED, which is host-initiated) but no RPC
--      ever used it.
-- All SECURITY DEFINER, all follow the existing authorization pattern
-- (fn_is_team_host_or_cohost / fn_is_admin), all EXECUTE-granted to
-- authenticated only, consistent with 20260904160400_hardening.sql.

alter table public.teams add column if not exists join_code text;

create or replace function public.tg_teams_generate_join_code()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_code text;
  v_attempts int := 0;
begin
  if new.join_code is not null then
    return new;
  end if;

  loop
    v_code := 'TM-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from public.teams where join_code = v_code);
    v_attempts := v_attempts + 1;
    if v_attempts > 20 then
      raise exception 'JOIN_CODE_GENERATION_FAILED' using errcode = '55000';
    end if;
  end loop;

  new.join_code := v_code;
  return new;
end;
$fn$;

drop trigger if exists trg_teams_generate_join_code on public.teams;
create trigger trg_teams_generate_join_code
  before insert on public.teams
  for each row execute function public.tg_teams_generate_join_code();

-- Backfill any pre-existing rows (none expected yet, but keep this migration safe to rerun/idempotent).
update public.teams set join_code = 'TM-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))
where join_code is null;

alter table public.teams alter column join_code set not null;
create unique index if not exists uq_teams_join_code on public.teams (join_code);

-- 2. Phone lookup for adding existing members ---------------------------
create or replace function public.fn_lookup_user_by_phone(p_phone text)
returns table (id uuid, full_name text, avatar_url text, phone text)
language sql
security definer
stable
set search_path to 'public'
as $fn$
  select p.id, p.full_name, p.avatar_url, p.phone
  from public.profiles p
  where p.phone = p_phone
  limit 1;
$fn$;

-- 3. Join-by-code flow ---------------------------------------------------
create or replace function public.fn_lookup_team_by_join_code(p_join_code text)
returns table (id uuid, name text, member_count bigint)
language sql
security definer
stable
set search_path to 'public'
as $fn$
  select t.id, t.name, count(tm.id) filter (where tm.status = 'ACTIVE')
  from public.teams t
  left join public.team_members tm on tm.team_id = t.id
  where t.join_code = upper(trim(p_join_code)) and t.status <> 'ARCHIVED'
  group by t.id, t.name;
$fn$;

create or replace function public.fn_request_join_team(p_join_code text)
returns table (team_member_id uuid, team_id uuid, team_name text)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_team public.teams%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  select * into v_team from public.teams where join_code = upper(trim(p_join_code)) and status <> 'ARCHIVED';
  if not found then
    raise exception 'INVALID_JOIN_CODE' using errcode = '22023';
  end if;

  insert into public.team_members (team_id, user_id, team_role, status)
  values (v_team.id, auth.uid(), 'MEMBER', 'PENDING')
  on conflict (team_id, user_id) do update
    set status = 'PENDING', updated_at = now()
    where public.team_members.status in ('REJECTED', 'LEFT', 'REMOVED')
  returning id into v_id;

  if v_id is null then
    raise exception 'ALREADY_ON_TEAM' using errcode = '23505';
  end if;

  return query select v_id, v_team.id, v_team.name;
end;
$fn$;

create or replace function public.fn_respond_to_join_request(p_team_member_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_row public.team_members%rowtype;
begin
  select * into v_row from public.team_members where id = p_team_member_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if not (public.fn_is_team_host_or_cohost(v_row.team_id) or public.fn_is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_row.status <> 'PENDING' then
    raise exception 'REQUEST_NOT_PENDING' using errcode = '22023';
  end if;

  if p_accept then
    update public.team_members set status = 'ACTIVE', joined_at = now() where id = p_team_member_id;
  else
    update public.team_members set status = 'REJECTED' where id = p_team_member_id;
  end if;
end;
$fn$;

revoke all on function public.fn_lookup_user_by_phone(text) from public, anon;
revoke all on function public.fn_lookup_team_by_join_code(text) from public, anon;
revoke all on function public.fn_request_join_team(text) from public, anon;
revoke all on function public.fn_respond_to_join_request(uuid, boolean) from public, anon;

grant execute on function public.fn_lookup_user_by_phone(text) to authenticated;
grant execute on function public.fn_lookup_team_by_join_code(text) to authenticated;
grant execute on function public.fn_request_join_team(text) to authenticated;
grant execute on function public.fn_respond_to_join_request(uuid, boolean) to authenticated;

-- 4. Seed a bookable turf + slots ----------------------------------------
-- Nothing in Book Turf can show anything without at least one
-- turf_resources row and a window of turf_slots. 60 days, hourly,
-- 5AM-midnight, matching chk_turf_slots_operating_hours.
do $$
declare
  v_turf_id uuid;
  v_day date;
  v_hour int;
begin
  select id into v_turf_id from public.turf_resources where name = 'Thrill Mill Turf';
  if v_turf_id is null then
    insert into public.turf_resources (name, description)
    values ('Thrill Mill Turf', 'Thrill Mill Arena — indoor football turf')
    returning id into v_turf_id;
  end if;

  for v_day in select generate_series(current_date, current_date + interval '59 days', interval '1 day')::date loop
    for v_hour in 5..23 loop
      insert into public.turf_slots (turf_id, slot_date, start_time, end_time, status)
      values (v_turf_id, v_day, make_time(v_hour, 0, 0), make_time(v_hour + 1, 0, 0), 'AVAILABLE')
      on conflict (turf_id, slot_date, start_time) do nothing;
    end loop;
  end loop;
end $$;
