-- Thrill Mill Club — Row Level Security
--
-- Policy shape used throughout: financial/booking/membership/audit tables are
-- READ-ONLY via RLS for clients — every write to them happens through a
-- SECURITY DEFINER RPC (20260904160200_rpc_functions.sql) that re-validates
-- authorization and business rules server-side, then writes atomically.
-- With RLS enabled and no INSERT/UPDATE/DELETE policy granted to the
-- `authenticated` role on a table, direct client writes are denied by
-- default — only the RPCs (running as the function owner) can write.
--
-- Helper functions are SECURITY DEFINER + STABLE so they can be used inside
-- policies without recursive-RLS issues or per-row re-planning cost.

-- ============================================================================
-- Helper functions
-- ============================================================================

create or replace function public.fn_is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.platform_role = 'ADMIN'
  );
$$;

create or replace function public.fn_is_team_member(p_team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id and tm.user_id = auth.uid() and tm.status = 'ACTIVE'
  );
$$;

create or replace function public.fn_team_role(p_team_id uuid)
returns team_role
language sql
security definer
stable
set search_path = public
as $$
  select tm.team_role from public.team_members tm
  where tm.team_id = p_team_id and tm.user_id = auth.uid() and tm.status = 'ACTIVE'
  limit 1;
$$;

create or replace function public.fn_is_team_host_or_cohost(p_team_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.fn_team_role(p_team_id) in ('HOST', 'CO_HOST');
$$;

-- ============================================================================
-- profiles
-- ============================================================================

alter table public.profiles enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or public.fn_is_admin()
    or exists (
      select 1 from public.team_members me
      join public.team_members them on them.team_id = me.team_id
      where me.user_id = auth.uid() and me.status = 'ACTIVE'
        and them.user_id = profiles.id and them.status = 'ACTIVE'
    )
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.fn_is_admin())
  with check (id = auth.uid() or public.fn_is_admin());
-- (platform_role escalation is separately blocked by trg_profiles_protect_role)

-- No client INSERT/DELETE policy: rows are provisioned by trg_handle_new_auth_user.

-- ============================================================================
-- teams
-- ============================================================================

alter table public.teams enable row level security;

create policy teams_select on public.teams
  for select to authenticated
  using (public.fn_is_team_member(id) or public.fn_is_admin());

-- No direct INSERT/UPDATE/DELETE: use fn_create_team / admin RPCs.

-- ============================================================================
-- team_members
-- ============================================================================

alter table public.team_members enable row level security;

create policy team_members_select on public.team_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.fn_is_team_member(team_id)
    or public.fn_is_admin()
  );

-- No direct INSERT/UPDATE/DELETE: use fn_invite_team_member / fn_respond_to_invite /
-- fn_assign_co_host / fn_remove_team_member / fn_leave_team.

-- ============================================================================
-- membership_plans (public catalog)
-- ============================================================================

alter table public.membership_plans enable row level security;

create policy membership_plans_select on public.membership_plans
  for select to authenticated
  using (true);

-- No client writes: seeded by migration; future price changes are an explicit
-- migration per CLAUDE.md ("pricing must not change without explicit approval").

-- ============================================================================
-- team_memberships
-- ============================================================================

alter table public.team_memberships enable row level security;

create policy team_memberships_select on public.team_memberships
  for select to authenticated
  using (public.fn_is_team_member(team_id) or public.fn_is_admin());

-- No direct writes: use fn_request_team_membership / fn_admin_verify_payment.

-- ============================================================================
-- team_wallets
-- ============================================================================

alter table public.team_wallets enable row level security;

create policy team_wallets_select on public.team_wallets
  for select to authenticated
  using (public.fn_is_team_member(team_id) or public.fn_is_admin());

-- No direct writes: every balance change is RPC-only (booking confirm/cancel,
-- membership activation, admin adjustment) so a wallet_ledger row is guaranteed.

-- ============================================================================
-- wallet_ledger (append-only)
-- ============================================================================

alter table public.wallet_ledger enable row level security;

create policy wallet_ledger_select on public.wallet_ledger
  for select to authenticated
  using (public.fn_is_team_member(team_id) or public.fn_is_admin());

-- No INSERT/UPDATE/DELETE policy for authenticated at all — RPCs only, and even
-- RPCs never UPDATE/DELETE a ledger row, only INSERT.

-- ============================================================================
-- payments
-- ============================================================================

alter table public.payments enable row level security;

create policy payments_select on public.payments
  for select to authenticated
  using (
    public.fn_is_admin()
    or exists (
      select 1 from public.team_memberships tmem
      where tmem.id = payments.team_membership_id
        and public.fn_is_team_member(tmem.team_id)
    )
  );

-- No direct writes: use fn_request_team_membership (creates PAYMENT_EXPECTED)
-- and fn_admin_verify_payment (Admin-only verification).

-- ============================================================================
-- turf_resources (public catalog)
-- ============================================================================

alter table public.turf_resources enable row level security;

create policy turf_resources_select on public.turf_resources
  for select to authenticated
  using (true);

create policy turf_resources_admin_write on public.turf_resources
  for all to authenticated
  using (public.fn_is_admin())
  with check (public.fn_is_admin());

-- ============================================================================
-- turf_slots
-- ============================================================================

alter table public.turf_slots enable row level security;

create policy turf_slots_select on public.turf_slots
  for select to authenticated
  using (true);

create policy turf_slots_admin_insert on public.turf_slots
  for insert to authenticated
  with check (public.fn_is_admin());

-- No UPDATE policy for authenticated (incl. admin): status transitions
-- (HELD/CONFIRMED/BLOCKED) must go through fn_create_slot_hold /
-- fn_confirm_booking / fn_cancel_booking / fn_admin_block_slot / fn_admin_unblock_slot
-- so every block/unblock is guaranteed an admin_audit_logs row.

-- ============================================================================
-- slot_holds
-- ============================================================================

alter table public.slot_holds enable row level security;

create policy slot_holds_select on public.slot_holds
  for select to authenticated
  using (public.fn_is_team_member(team_id) or public.fn_is_admin());

-- No direct writes: use fn_create_slot_hold / fn_confirm_booking (converts) /
-- fn_expire_stale_holds (system).

-- ============================================================================
-- bookings
-- ============================================================================

alter table public.bookings enable row level security;

create policy bookings_select on public.bookings
  for select to authenticated
  using (public.fn_is_team_member(team_id) or public.fn_is_admin());

-- No direct writes: use fn_confirm_booking / fn_cancel_booking / fn_complete_booking.

-- ============================================================================
-- booking_participants
-- ============================================================================

alter table public.booking_participants enable row level security;

create policy booking_participants_select on public.booking_participants
  for select to authenticated
  using (
    public.fn_is_admin()
    or exists (
      select 1 from public.bookings b
      where b.id = booking_participants.booking_id
        and public.fn_is_team_member(b.team_id)
    )
  );

-- No direct writes: use fn_confirm_booking (initial selection) / fn_modify_participants.

-- ============================================================================
-- member_usage_attribution
-- ============================================================================

alter table public.member_usage_attribution enable row level security;

create policy member_usage_attribution_select on public.member_usage_attribution
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.fn_is_team_member(team_id)
    or public.fn_is_admin()
  );

-- No direct writes: computed only by fn_complete_booking.

-- ============================================================================
-- chat_rooms
-- ============================================================================

alter table public.chat_rooms enable row level security;

create policy chat_rooms_select on public.chat_rooms
  for select to authenticated
  using (public.fn_is_team_member(team_id) or public.fn_is_admin());

-- No client writes: one room auto-created per team by fn_create_team.

-- ============================================================================
-- chat_messages
-- ============================================================================

alter table public.chat_messages enable row level security;

create policy chat_messages_select on public.chat_messages
  for select to authenticated
  using (
    public.fn_is_admin()
    or exists (
      select 1 from public.chat_rooms r
      where r.id = chat_messages.room_id and public.fn_is_team_member(r.team_id)
    )
  );

create policy chat_messages_insert on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.chat_rooms r
      where r.id = chat_messages.room_id and public.fn_is_team_member(r.team_id)
    )
  );

create policy chat_messages_soft_delete on public.chat_messages
  for update to authenticated
  using (
    sender_id = auth.uid()
    or public.fn_is_admin()
    or exists (
      select 1 from public.chat_rooms r
      where r.id = chat_messages.room_id and public.fn_is_team_host_or_cohost(r.team_id)
    )
  )
  with check (true);

-- ============================================================================
-- notifications
-- ============================================================================

alter table public.notifications enable row level security;

create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid() or public.fn_is_admin());

create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No client INSERT: notifications are system/RPC-generated only.

-- ============================================================================
-- admin_audit_logs (append-only, admin-read-only)
-- ============================================================================

alter table public.admin_audit_logs enable row level security;

create policy admin_audit_logs_select on public.admin_audit_logs
  for select to authenticated
  using (public.fn_is_admin());

-- No client writes at all: every sensitive-action RPC inserts its own row
-- (running SECURITY DEFINER), never the client directly.

-- ============================================================================
-- leaderboard_weekly (public read)
-- ============================================================================

alter table public.leaderboard_weekly enable row level security;

create policy leaderboard_weekly_select on public.leaderboard_weekly
  for select to authenticated
  using (true);

-- No client writes: computed only by fn_compute_weekly_leaderboard (admin/system).
