-- Three fixes/additions from user bug reports:
--
-- 1. fn_request_join_team always failed with a genuinely confusing
--    Postgres error: "column reference \"team_id\" is ambiguous". Root
--    cause: `returns table (team_member_id uuid, team_id uuid, team_name
--    text)` implicitly declares `team_id` as a PL/pgSQL OUT-parameter
--    variable, and `on conflict (team_id, user_id)` is parsed as an
--    expression list (conflict targets can be arbitrary index
--    expressions, e.g. `on conflict (lower(x))`), so PL/pgSQL tries to
--    resolve the bare `team_id` there and finds two candidates: the OUT
--    variable and the column. Rewritten to do an explicit existence
--    check + insert-or-update instead of ON CONFLICT, sidestepping the
--    ambiguity entirely and keeping the same return shape (no client
--    changes needed).
-- 2. No RPC enforced the 10-active-member-per-Team cap anywhere. Added to
--    every path that can make a member ACTIVE: fn_request_join_team,
--    fn_invite_team_member, fn_admin_add_team_member, and both accept
--    paths (fn_respond_to_team_invite, fn_respond_to_join_request) —
--    the last two matter because an invite/request can be issued while
--    under the cap and only become a problem at accept time if the Team
--    filled up in the meantime.
-- 3. fn_search_members: member-side "search by name or phone" (the
--    existing fn_lookup_user_by_phone is exact-phone-only, by design, for
--    the narrower "confirm this exact number" case). This is a broader
--    live-search directory lookup, deliberately capped (10 rows, no
--    empty/1-char queries, self excluded) — same shape of privilege the
--    Admin already has via plain RLS-bypassed table access, just scoped
--    down for a regular member.

create or replace function public.fn_request_join_team(p_join_code text)
returns table (team_member_id uuid, team_id uuid, team_name text)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_team public.teams%rowtype;
  v_id uuid;
  v_existing_status public.team_member_status;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  select * into v_team from public.teams where join_code = upper(trim(p_join_code)) and status <> 'ARCHIVED';
  if not found then
    raise exception 'INVALID_JOIN_CODE' using errcode = '22023';
  end if;

  select tm.status into v_existing_status
    from public.team_members tm
    where tm.team_id = v_team.id and tm.user_id = auth.uid();

  if v_existing_status is not null and v_existing_status not in ('REJECTED', 'LEFT', 'REMOVED') then
    raise exception 'ALREADY_ON_TEAM' using errcode = '23505';
  end if;

  if v_existing_status is null then
    if (select count(*) from public.team_members tm where tm.team_id = v_team.id and tm.status = 'ACTIVE') >= 10 then
      raise exception 'TEAM_FULL' using errcode = '22023';
    end if;

    insert into public.team_members (team_id, user_id, team_role, status)
    values (v_team.id, auth.uid(), 'MEMBER', 'PENDING')
    returning id into v_id;
  else
    update public.team_members
      set status = 'PENDING', updated_at = now()
      where team_id = v_team.id and user_id = auth.uid()
      returning id into v_id;
  end if;

  return query select v_id, v_team.id, v_team.name;
end;
$fn$;

create or replace function public.fn_invite_team_member(p_team_id uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_id uuid;
begin
  if not (public.fn_is_team_host_or_cohost(p_team_id) or public.fn_is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if (select count(*) from public.team_members tm where tm.team_id = p_team_id and tm.status = 'ACTIVE') >= 10 then
    raise exception 'TEAM_FULL' using errcode = '22023';
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
$fn$;

create or replace function public.fn_admin_add_team_member(p_team_id uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_id uuid;
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if (select count(*) from public.team_members tm where tm.team_id = p_team_id and tm.status = 'ACTIVE') >= 10 then
    raise exception 'TEAM_FULL' using errcode = '22023';
  end if;

  insert into public.team_members (team_id, user_id, team_role, status, invited_by, joined_at)
  values (p_team_id, p_user_id, 'MEMBER', 'ACTIVE', auth.uid(), now())
  on conflict (team_id, user_id) do update
    set status = 'ACTIVE', joined_at = now(), updated_at = now()
    where public.team_members.status in ('REJECTED', 'LEFT', 'REMOVED')
  returning id into v_id;

  if v_id is null then
    select id into v_id from public.team_members where team_id = p_team_id and user_id = p_user_id;
  end if;

  return v_id;
end;
$fn$;

create or replace function public.fn_respond_to_team_invite(p_team_member_id uuid, p_accept boolean)
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
  if v_row.user_id <> auth.uid() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_row.status <> 'INVITED' then
    raise exception 'INVITE_NOT_PENDING' using errcode = '22023';
  end if;

  if p_accept then
    if (select count(*) from public.team_members tm where tm.team_id = v_row.team_id and tm.status = 'ACTIVE') >= 10 then
      raise exception 'TEAM_FULL' using errcode = '22023';
    end if;
    update public.team_members
      set status = 'ACTIVE', joined_at = now()
      where id = p_team_member_id;
  else
    update public.team_members
      set status = 'REJECTED'
      where id = p_team_member_id;
  end if;
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
    if (select count(*) from public.team_members tm where tm.team_id = v_row.team_id and tm.status = 'ACTIVE') >= 10 then
      raise exception 'TEAM_FULL' using errcode = '22023';
    end if;
    update public.team_members set status = 'ACTIVE', joined_at = now() where id = p_team_member_id;
  else
    update public.team_members set status = 'REJECTED' where id = p_team_member_id;
  end if;
end;
$fn$;

create or replace function public.fn_search_members(p_query text)
returns table (id uuid, full_name text, avatar_url text, phone text)
language sql
security definer
stable
set search_path to 'public'
as $fn$
  select p.id, p.full_name, p.avatar_url, p.phone
  from public.profiles p
  where auth.uid() is not null
    and length(trim(p_query)) >= 2
    and p.id <> auth.uid()
    and (p.full_name ilike '%' || trim(p_query) || '%' or p.phone ilike '%' || trim(p_query) || '%')
  order by p.full_name nulls last
  limit 10;
$fn$;

revoke all on function public.fn_search_members(text) from public, anon;
grant execute on function public.fn_search_members(text) to authenticated;
