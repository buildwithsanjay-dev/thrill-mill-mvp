-- Real gap: an invited (not yet ACTIVE) member had no way to even see
-- what they were invited to. teams_select RLS correctly requires
-- fn_is_team_member(id) — someone still INVITED isn't a member yet, so a
-- plain `team_members` -> `teams` join returns their invite row but a
-- null/blocked team name. fn_respond_to_team_invite already existed to
-- accept/reject; this is the missing read side.
create or replace function public.fn_get_my_invites()
returns table (team_member_id uuid, team_id uuid, team_name text, invited_at timestamptz)
language sql
security definer
stable
set search_path to 'public'
as $fn$
  select tm.id, tm.team_id, t.name, tm.created_at
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  where tm.user_id = auth.uid() and tm.status = 'INVITED'
  order by tm.created_at desc;
$fn$;

revoke all on function public.fn_get_my_invites() from public, anon;
grant execute on function public.fn_get_my_invites() to authenticated;
