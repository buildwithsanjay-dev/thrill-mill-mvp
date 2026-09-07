-- profiles_select RLS only lets you see another user's profile once you're
-- both ACTIVE on a shared Team — correct for general privacy, but it means
-- a Host looking at their own Team Details screen can't see the *name* of
-- someone they invited (still INVITED) or someone requesting to join
-- (PENDING) until that person accepts. The Host needs to see who they're
-- managing. This RPC closes that gap narrowly: only the Team's Host/
-- Co-Host/an Admin gets every row with profile fields attached; anyone
-- else calling it gets exactly what RLS would already show them (ACTIVE
-- members only), so it never leaks more than the caller is entitled to.
create or replace function public.fn_get_team_roster(p_team_id uuid)
returns table (
  team_member_id uuid,
  user_id uuid,
  team_role public.team_role,
  status public.team_member_status,
  joined_at timestamptz,
  created_at timestamptz,
  full_name text,
  avatar_url text,
  phone text
)
language sql
security definer
stable
set search_path to 'public'
as $fn$
  select
    tm.id,
    tm.user_id,
    tm.team_role,
    tm.status,
    tm.joined_at,
    tm.created_at,
    p.full_name,
    p.avatar_url,
    p.phone
  from public.team_members tm
  join public.profiles p on p.id = tm.user_id
  where tm.team_id = p_team_id
    -- Must be a member of this Team (or an Admin) at all, full stop —
    -- otherwise the OR below would leak ACTIVE members' names/phones to
    -- any authenticated stranger who guesses a team_id.
    and (public.fn_is_team_member(p_team_id) or public.fn_is_admin())
    and (
      public.fn_is_team_host_or_cohost(p_team_id)
      or public.fn_is_admin()
      or tm.status = 'ACTIVE'
    )
  order by tm.created_at asc;
$fn$;

revoke all on function public.fn_get_team_roster(uuid) from public, anon;
grant execute on function public.fn_get_team_roster(uuid) to authenticated;
