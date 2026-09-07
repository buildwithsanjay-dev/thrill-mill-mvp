-- Thrill Mill Club — hardening pass, addressing Supabase advisor findings on
-- the initial schema/RLS/RPC migration:
--   1. set_updated_at had a mutable search_path (real security lint, not just style).
--   2. RLS policies called auth.uid() directly per-row instead of (select auth.uid()),
--      which defeats Postgres's ability to cache it once per query.
--   3. turf_resources had two overlapping permissive SELECT policies.
--   4. Every RPC was left EXECUTE-able by the `anon` role — unauthenticated
--      callers should be denied at the grant level, not just fail inside the
--      function body.
--   5. Financial/audit FK columns (admin_id, verified_by, created_by, ...)
--      had no covering index.

-- ----------------------------------------------------------------------------
-- 1. Fix set_updated_at search_path
-- ----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. Rewrite policies flagged for per-row auth.uid() re-evaluation
-- ----------------------------------------------------------------------------

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())
    or public.fn_is_admin()
    or exists (
      select 1 from public.team_members me
      join public.team_members them on them.team_id = me.team_id
      where me.user_id = (select auth.uid()) and me.status = 'ACTIVE'
        and them.user_id = profiles.id and them.status = 'ACTIVE'
    )
  );

drop policy profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or public.fn_is_admin())
  with check (id = (select auth.uid()) or public.fn_is_admin());

drop policy team_members_select on public.team_members;
create policy team_members_select on public.team_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.fn_is_team_member(team_id)
    or public.fn_is_admin()
  );

drop policy member_usage_attribution_select on public.member_usage_attribution;
create policy member_usage_attribution_select on public.member_usage_attribution
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.fn_is_team_member(team_id)
    or public.fn_is_admin()
  );

drop policy chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.chat_rooms r
      where r.id = chat_messages.room_id and public.fn_is_team_member(r.team_id)
    )
  );

drop policy chat_messages_soft_delete on public.chat_messages;
create policy chat_messages_soft_delete on public.chat_messages
  for update to authenticated
  using (
    sender_id = (select auth.uid())
    or public.fn_is_admin()
    or exists (
      select 1 from public.chat_rooms r
      where r.id = chat_messages.room_id and public.fn_is_team_host_or_cohost(r.team_id)
    )
  )
  with check (true);

drop policy notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()) or public.fn_is_admin());

drop policy notifications_mark_read on public.notifications;
create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ----------------------------------------------------------------------------
-- 3. Split turf_resources admin policy so SELECT isn't duplicated
-- ----------------------------------------------------------------------------

drop policy turf_resources_admin_write on public.turf_resources;
create policy turf_resources_admin_insert on public.turf_resources
  for insert to authenticated
  with check (public.fn_is_admin());
create policy turf_resources_admin_update on public.turf_resources
  for update to authenticated
  using (public.fn_is_admin())
  with check (public.fn_is_admin());
create policy turf_resources_admin_delete on public.turf_resources
  for delete to authenticated
  using (public.fn_is_admin());

-- ----------------------------------------------------------------------------
-- 4. Lock down EXECUTE grants — deny `anon` entirely; internal SQL helpers
--    (used only inside RLS policies) also don't need direct client access.
-- ----------------------------------------------------------------------------

revoke execute on function
  public.fn_create_team(text, uuid),
  public.fn_invite_team_member(uuid, uuid),
  public.fn_respond_to_team_invite(uuid, boolean),
  public.fn_assign_co_host(uuid, uuid),
  public.fn_remove_team_member(uuid),
  public.fn_leave_team(uuid),
  public.fn_request_team_membership(uuid, text, text, text),
  public.fn_admin_verify_payment(uuid, text),
  public.fn_create_slot_hold(uuid, uuid),
  public.fn_confirm_booking(uuid, uuid[]),
  public.fn_modify_participants(uuid, uuid[], uuid[]),
  public.fn_cancel_booking(uuid, text),
  public.fn_complete_booking(uuid),
  public.fn_expire_stale_holds(),
  public.fn_admin_adjust_credits(uuid, numeric, text),
  public.fn_admin_block_slot(uuid, text),
  public.fn_admin_unblock_slot(uuid),
  public.fn_compute_weekly_leaderboard(date)
from public, anon;

revoke execute on function
  public.fn_is_admin(),
  public.fn_is_team_member(uuid),
  public.fn_team_role(uuid),
  public.fn_is_team_host_or_cohost(uuid)
from public, anon;
-- `authenticated` keeps EXECUTE on these: they're evaluated as part of RLS
-- policies, which run with the querying role's privileges.

revoke execute on function
  public.set_updated_at(),
  public.tg_profiles_protect_role(),
  public.handle_new_auth_user()
from public, anon, authenticated;
-- Trigger functions are invoked by the system, not via direct RPC call —
-- no role needs EXECUTE on them.

-- ----------------------------------------------------------------------------
-- 5. Cover financial/audit FK columns with indexes
-- ----------------------------------------------------------------------------

create index ix_admin_audit_logs_admin on public.admin_audit_logs (admin_id);
create index ix_payments_verified_by on public.payments (verified_by) where verified_by is not null;
create index ix_wallet_ledger_created_by on public.wallet_ledger (created_by) where created_by is not null;
create index ix_teams_created_by on public.teams (created_by) where created_by is not null;
create index ix_team_memberships_plan on public.team_memberships (plan_id);
create index ix_team_memberships_requested_by on public.team_memberships (requested_by) where requested_by is not null;
create index ix_team_memberships_admin_reviewed_by on public.team_memberships (admin_reviewed_by) where admin_reviewed_by is not null;
create index ix_team_memberships_payment on public.team_memberships (payment_id) where payment_id is not null;
create index ix_team_members_invited_by on public.team_members (invited_by) where invited_by is not null;
create index ix_slot_holds_team on public.slot_holds (team_id);
create index ix_slot_holds_held_by on public.slot_holds (held_by) where held_by is not null;
create index ix_bookings_turf on public.bookings (turf_id);
create index ix_bookings_hold on public.bookings (hold_id) where hold_id is not null;
create index ix_bookings_created_by on public.bookings (created_by) where created_by is not null;
create index ix_booking_participants_added_by on public.booking_participants (added_by) where added_by is not null;
create index ix_turf_slots_blocked_by on public.turf_slots (blocked_by) where blocked_by is not null;
create index ix_chat_messages_sender on public.chat_messages (sender_id);
create index ix_leaderboard_weekly_team on public.leaderboard_weekly (team_id) where team_id is not null;
create index ix_leaderboard_weekly_user on public.leaderboard_weekly (user_id) where user_id is not null;
