-- Owner-flagged gap (2026-09-24): fn_delete_my_account's HOST_MUST_TRANSFER
-- error tells a Host to "hand the Host role to another member," but no such
-- feature existed — only fn_assign_co_host (Co-Host) and fn_remove_team_member
-- did. In practice the only way to clear the block was an Admin archiving the
-- whole team, which strands every member (team becomes unjoinable/unbookable,
-- CLAUDE.md's TEAM_ARCHIVED rule) and leaves the Team's credits unspendable
-- just because one person wanted to delete their own account. This adds the
-- missing self-service path: a Host can hand the role to any other ACTIVE
-- member of their own Team, in one atomic step, with no effect on the Team's
-- wallet/bookings/history.

create or replace function public.fn_transfer_host(
  p_team_id uuid,
  p_new_host_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host public.team_members%rowtype;
  v_target public.team_members%rowtype;
  v_team public.teams%rowtype;
  v_caller_is_admin boolean := public.fn_is_admin();
begin
  select * into v_team from public.teams where id = p_team_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_team.status = 'ARCHIVED' then
    raise exception 'TEAM_ARCHIVED' using errcode = '22023';
  end if;

  -- Lock the current Host row first — both the authorization check (a plain
  -- member can never call this, even for their own team) and the eventual
  -- demotion read/write the same row.
  select * into v_host from public.team_members
    where team_id = p_team_id and team_role = 'HOST' and status = 'ACTIVE'
    for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if not (v_host.user_id = auth.uid() or v_caller_is_admin) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_target from public.team_members
    where team_id = p_team_id and user_id = p_new_host_user_id and status = 'ACTIVE'
    for update;
  if not found then
    raise exception 'MEMBER_NOT_ACTIVE' using errcode = '22023';
  end if;
  if v_target.id = v_host.id then
    raise exception 'ALREADY_HOST' using errcode = '22023';
  end if;

  update public.team_members set team_role = 'MEMBER' where id = v_host.id;
  update public.team_members set team_role = 'HOST' where id = v_target.id;

  -- Only an Admin stepping in on someone else's behalf is a sensitive Admin
  -- action needing an audit trail (CLAUDE.md: "role change") — the Host doing
  -- this themselves is ordinary Team self-service, same as fn_assign_co_host.
  if v_caller_is_admin and v_host.user_id <> auth.uid() then
    insert into public.admin_audit_logs
      (admin_id, action, target_type, target_id, reason, before_state, after_state)
    values
      (auth.uid(), 'TEAM_HOST_TRANSFERRED', 'team', p_team_id,
       'Admin-initiated Host transfer',
       jsonb_build_object('host_user_id', v_host.user_id),
       jsonb_build_object('host_user_id', v_target.user_id));
  end if;
end;
$$;

revoke execute on function public.fn_transfer_host(uuid, uuid) from public, anon;
grant execute on function public.fn_transfer_host(uuid, uuid) to authenticated;
