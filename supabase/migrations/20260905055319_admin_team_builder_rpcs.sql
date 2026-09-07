-- Admin-assisted "Create Network" (see assets/UI -Admin page/Create Network -
-- *.png) has a shape the member-side RPCs don't quite fit:
--   - Team Details (step 1) collects only a name — no Host is chosen yet.
--     fn_create_team always inserts an ACTIVE HOST row immediately
--     (coalesce(p_host_user_id, auth.uid())), which would wrongly make the
--     Admin themselves the Host of every network they set up.
--   - Add Members (step 2) must add members as already-ACTIVE — Assign
--     Roles (step 3) needs to promote them to Host/Co-host immediately
--     after, but fn_assign_co_host/role changes require ACTIVE status, and
--     ordinary fn_invite_team_member leaves them INVITED pending their own
--     acceptance (correct for the member-side flow, wrong for an Admin
--     entering a roster on members' behalf).
--   - Create Booking (Admin) has no participant-picker step in the design,
--     but fn_confirm_booking requires a non-empty, all-ACTIVE participant
--     list.
-- These RPCs are additive and admin-only; none of the existing member-side
-- RPCs or their authorization checks change.

-- 1. Create a team with no membership rows at all yet.
create or replace function public.fn_admin_create_team(p_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_team_id uuid;
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'INVALID_TEAM_NAME' using errcode = '22023';
  end if;

  insert into public.teams (name, status, created_by)
  values (trim(p_name), 'CREATED', auth.uid())
  returning id into v_team_id;

  insert into public.team_wallets (team_id) values (v_team_id);
  insert into public.chat_rooms (team_id) values (v_team_id);

  return v_team_id;
end;
$fn$;

-- 2. Add an existing Thrill Mill member directly as ACTIVE (no invite/accept
--    round-trip) — the Admin is asserting this roster on the members' behalf.
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

-- 3. Set an ACTIVE member's role, enforcing the one-HOST/one-CO_HOST
--    invariants by demoting whoever currently holds that role first.
create or replace function public.fn_admin_set_team_role(p_team_id uuid, p_user_id uuid, p_role public.team_role)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if p_role in ('HOST', 'CO_HOST') then
    update public.team_members
      set team_role = 'MEMBER'
      where team_id = p_team_id and status = 'ACTIVE' and team_role = p_role and user_id <> p_user_id;
  end if;

  update public.team_members
    set team_role = p_role
    where team_id = p_team_id and user_id = p_user_id and status = 'ACTIVE';

  if not found then
    raise exception 'MEMBER_NOT_ACTIVE' using errcode = '22023';
  end if;
end;
$fn$;

-- 4. Admin-assisted booking confirm: same pricing/availability engine as
--    fn_confirm_booking, just defaulted to the Team's Host as sole
--    participant when the Admin flow doesn't collect a participant list.
create or replace function public.fn_admin_confirm_booking_for_host(p_hold_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_team_id uuid;
  v_host_id uuid;
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

  return public.fn_confirm_booking(p_hold_id, array[v_host_id]);
end;
$fn$;

revoke all on function public.fn_admin_create_team(text) from public, anon;
revoke all on function public.fn_admin_add_team_member(uuid, uuid) from public, anon;
revoke all on function public.fn_admin_set_team_role(uuid, uuid, public.team_role) from public, anon;
revoke all on function public.fn_admin_confirm_booking_for_host(uuid) from public, anon;

grant execute on function public.fn_admin_create_team(text) to authenticated;
grant execute on function public.fn_admin_add_team_member(uuid, uuid) to authenticated;
grant execute on function public.fn_admin_set_team_role(uuid, uuid, public.team_role) to authenticated;
grant execute on function public.fn_admin_confirm_booking_for_host(uuid) to authenticated;
