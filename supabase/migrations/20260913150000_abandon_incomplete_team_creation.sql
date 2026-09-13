-- Item 2 from the project owner's 2026-09-13 EAS preview bug report: "the
-- team should not be created if the 3 step team creation is completed — if
-- one step [is] not completed then the team must not be created."
--
-- Prior to this migration, fn_create_team ran on step 1's Continue (see
-- createTeamWizard.ts's own top-of-file comment, which explicitly documented
-- the OPPOSITE design on purpose: "a user who backs out partway still has a
-- real, server-recorded Team rather than losing everything silently"). That
-- design is what's being reversed here, per explicit instruction.
--
-- Doing this correctly without a much larger rework (deferring EVERY write —
-- team, invites, membership request — to one final atomic step) would need
-- restructuring how Add Members invites members (it calls
-- fn_invite_team_member against a real team_id immediately, so members can
-- see/accept an invite before the wizard finishes). Rather than that, this
-- takes the narrower, lower-risk fix that still satisfies the rule: an
-- incomplete Team creation (never reaches a membership request/plan
-- selection) does not survive.
--
-- 1. fn_abandon_team_creation — explicit hard delete (not a soft
--    ARCHIVED, unlike fn_admin_archive_team) of a still-'CREATED', still
--    membership-request-free Team. This is safe to hard-delete (not a
--    CLAUDE.md violation) specifically BECAUSE nothing financial/auditable
--    can exist yet at this stage: a Team only gets bookable credits after a
--    membership request is admin-verified, and no booking/wallet_ledger/
--    admin_audit_logs row can reference a Team before that. team_members,
--    team_memberships, and team_wallets all cascade-delete from teams.
create or replace function public.fn_abandon_team_creation(
  p_team_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team public.teams%rowtype;
begin
  select * into v_team from public.teams where id = p_team_id for update;
  if not found then
    return; -- already gone (e.g. the scheduled cleanup below beat us to it) — fine.
  end if;

  if not (v_team.created_by = auth.uid() or public.fn_is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_team.status <> 'CREATED' or exists (
    select 1 from public.team_memberships where team_id = p_team_id
  ) then
    -- A membership request (even a still-pending one) means Step 3 was
    -- reached — this is a real Team now, not an abandoned draft. Refuse
    -- rather than silently no-op, so a client bug can't accidentally wipe
    -- out a genuine Team.
    raise exception 'TEAM_ALREADY_FINALIZED' using errcode = '22023';
  end if;

  delete from public.teams where id = p_team_id;
end;
$$;

revoke execute on function public.fn_abandon_team_creation(uuid) from public, anon;
grant execute on function public.fn_abandon_team_creation(uuid) to authenticated;

-- 2. fn_cleanup_abandoned_team_creations — the actual guarantee. The client
--    calling fn_abandon_team_creation on an explicit "cancel" covers the
--    common case immediately, but a user can always just close the app
--    mid-wizard instead of navigating back, and no client-side hook can
--    promise to run then. This scheduled sweep is what makes "an incomplete
--    Team never persists" true unconditionally, not just when the user
--    exits tidily — same self-healing pattern already used in this project
--    for fn_expire_stale_holds and fn_auto_complete_past_bookings.
--
--    2-hour grace window: long enough that a user still mid-flow (e.g.
--    stepped away to find a member's phone number) never loses their
--    in-progress Team out from under them, short enough that an abandoned
--    draft doesn't linger.
create or replace function public.fn_cleanup_abandoned_team_creations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with abandoned as (
    select t.id
    from public.teams t
    where t.status = 'CREATED'
      and t.created_at < now() - interval '2 hours'
      and not exists (select 1 from public.team_memberships tm where tm.team_id = t.id)
  )
  delete from public.teams where id in (select id from abandoned);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.fn_cleanup_abandoned_team_creations() from public, anon;

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-abandoned-team-creations') then
    perform cron.unschedule('cleanup-abandoned-team-creations');
  end if;
end $$;

select cron.schedule(
  'cleanup-abandoned-team-creations',
  '*/30 * * * *',
  $$select public.fn_cleanup_abandoned_team_creations();$$
);
