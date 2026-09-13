-- Item 3 from the project owner's 2026-09-13 EAS preview bug report:
-- "the team created can be deleted by the admin" — resolved, per explicit
-- confirmation, as ARCHIVE (soft state via the existing team_status enum's
-- 'ARCHIVED' value, added in 20260904160000_schema_tables.sql but never
-- actually reachable until now), not a hard delete. This matches CLAUDE.md's
-- "Historical financial/booking/audit records are never silently
-- overwritten — use soft states ... and correction events, not deletion or
-- in-place edits" rule, and the join-code lookup RPCs already excluded
-- ARCHIVED teams (see 20260905044245_join_flow_and_lookups.sql) in
-- anticipation of this.

create or replace function public.fn_admin_archive_team(
  p_team_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.teams%rowtype;
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_team from public.teams where id = p_team_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_team.status = 'ARCHIVED' then
    return; -- idempotent no-op — already archived
  end if;

  update public.teams set status = 'ARCHIVED' where id = p_team_id;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, reason, before_state, after_state)
  values
    (auth.uid(), 'TEAM_ARCHIVED', 'team', p_team_id, p_reason,
     jsonb_build_object('status', v_team.status),
     jsonb_build_object('status', 'ARCHIVED'));
end;
$$;

revoke execute on function public.fn_admin_archive_team(uuid, text) from public, anon;
grant execute on function public.fn_admin_archive_team(uuid, text) to authenticated;

-- Defense in depth to match: an archived Team is a dead end, not just a
-- "hidden from lists" cosmetic state — it must not be joinable or bookable
-- either, independent of what any client screen chooses to show. Slot
-- holds are the earliest point in the booking flow, so block there.
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

  -- Self-heal a stale hold: if HELD but its hold already expired, release it.
  -- (fn_expire_stale_holds also runs proactively via pg_cron — see
  -- 20260913130000_schedule_expire_stale_holds.sql — this stays as a
  -- second, immediate line of defense for this exact slot.)
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
