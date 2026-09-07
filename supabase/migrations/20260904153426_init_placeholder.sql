-- Placeholder migration. The real schema (profiles, teams, team_members,
-- membership_plans, team_memberships, team_wallets, wallet_ledger, payments,
-- turf_resources, turf_slots, slot_holds, bookings, booking_participants,
-- member_usage_attribution, chat_rooms, chat_messages, notifications,
-- admin_audit_logs, leaderboard_weekly) plus RLS policies and RPC functions
-- is deliberately deferred to its own focused pass — see CLAUDE.md and
-- docs/architecture.md for the full table list and invariants it must satisfy.
--
-- This file exists only to prove the migration pipeline (supabase CLI ->
-- migrations/ -> `supabase db push`) works end-to-end before real schema work
-- begins.

select 1;
