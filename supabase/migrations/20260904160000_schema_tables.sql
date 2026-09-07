-- Thrill Mill Club — core schema
-- 18 tables from docs/architecture.md §4, plus enums and helper triggers.
-- RLS policies: 20260904160100_rls_policies.sql
-- RPC functions: 20260904160200_rpc_functions.sql
-- Seed data:     20260904160300_seed_membership_plans.sql

create extension if not exists pgcrypto;

-- ============================================================================
-- ENUMS
-- ============================================================================

create type platform_role as enum ('MEMBER', 'ADMIN');
create type team_role as enum ('HOST', 'CO_HOST', 'MEMBER');
create type team_status as enum ('CREATED', 'ACTIVE', 'INACTIVE', 'ARCHIVED');
create type team_member_status as enum ('INVITED', 'PENDING', 'ACTIVE', 'REMOVED', 'REJECTED', 'LEFT');
create type membership_request_status as enum (
  'PLAN_SELECTED', 'REQUEST_SUBMITTED', 'PAYMENT_PENDING', 'ADMIN_REVIEW',
  'PAYMENT_VERIFIED', 'ACTIVE'
);
create type payment_status as enum (
  'PAYMENT_EXPECTED', 'PAYMENT_PENDING', 'ADMIN_VERIFICATION', 'VERIFIED', 'NOT_VERIFIED'
);
create type wallet_ledger_entry_type as enum (
  'MEMBERSHIP_CREDIT', 'BOOKING_CONSUME', 'BOOKING_REFUND', 'ADMIN_ADJUSTMENT'
);
create type turf_slot_status as enum ('AVAILABLE', 'HELD', 'CONFIRMED', 'BLOCKED');
create type slot_hold_status as enum ('ACTIVE', 'CONVERTED', 'EXPIRED', 'RELEASED');
create type booking_status as enum (
  'HOLDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'FAILED'
);
create type participant_status as enum ('SELECTED', 'LOCKED', 'COMPLETED', 'REMOVED');

-- ============================================================================
-- HELPER: updated_at trigger
-- ============================================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 1. profiles
-- ============================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  platform_role platform_role not null default 'MEMBER',
  expo_push_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-provision a profile row when a new auth user signs up.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_handle_new_auth_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Prevent a client from ever elevating their own platform_role.
create or replace function public.tg_profiles_protect_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.platform_role is distinct from old.platform_role then
    if not exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.platform_role = 'ADMIN'
    ) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_profiles_protect_role
  before update on public.profiles
  for each row execute function public.tg_profiles_protect_role();

-- ============================================================================
-- 2. teams
-- ============================================================================

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status team_status not null default 'CREATED',
  created_by uuid references public.profiles(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_teams_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 3. team_members
-- ============================================================================

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  team_role team_role not null default 'MEMBER',
  status team_member_status not null default 'INVITED',
  invited_by uuid references public.profiles(id),
  joined_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create trigger trg_team_members_updated_at
  before update on public.team_members
  for each row execute function public.set_updated_at();

-- Exactly one ACTIVE HOST per team.
create unique index uq_team_members_one_active_host
  on public.team_members (team_id)
  where (status = 'ACTIVE' and team_role = 'HOST');

-- At most one ACTIVE CO_HOST per team.
create unique index uq_team_members_one_active_cohost
  on public.team_members (team_id)
  where (status = 'ACTIVE' and team_role = 'CO_HOST');

create index ix_team_members_user on public.team_members (user_id);

-- ============================================================================
-- 4. membership_plans
-- ============================================================================

create table public.membership_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_inr integer not null check (price_inr > 0),
  membership_rate_per_hour integer not null check (membership_rate_per_hour > 0),
  standard_rate_per_hour integer not null check (standard_rate_per_hour > 0),
  discounted_hours_cap_per_24h numeric(4,2), -- null = unlimited (₹25,000 plan)
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 5. team_memberships (a Team's plan request/activation lifecycle)
-- ============================================================================

create table public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  plan_id uuid not null references public.membership_plans(id),
  status membership_request_status not null default 'PLAN_SELECTED',
  requested_by uuid references public.profiles(id),
  host_phone text,
  co_host_phone text,
  admin_reviewed_by uuid references public.profiles(id),
  payment_id uuid, -- FK added after payments table exists
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_team_memberships_updated_at
  before update on public.team_memberships
  for each row execute function public.set_updated_at();

-- Only one non-terminal (not yet ACTIVE) membership request active per team at a time.
create unique index uq_team_memberships_one_pending
  on public.team_memberships (team_id)
  where (status <> 'ACTIVE');

create index ix_team_memberships_team on public.team_memberships (team_id);

-- ============================================================================
-- 6. team_wallets
-- ============================================================================

create table public.team_wallets (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references public.teams(id) on delete cascade,
  available_credits numeric(12,2) not null default 0 check (available_credits >= 0),
  reserved_credits numeric(12,2) not null default 0 check (reserved_credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_team_wallets_updated_at
  before update on public.team_wallets
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 7. wallet_ledger (append-only)
-- ============================================================================

create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id),
  entry_type wallet_ledger_entry_type not null,
  amount numeric(12,2) not null, -- signed: positive = credit added, negative = debit
  balance_after numeric(12,2) not null,
  reference_type text,
  reference_id uuid,
  created_by uuid references public.profiles(id),
  reason text,
  created_at timestamptz not null default now()
);

create index ix_wallet_ledger_team on public.wallet_ledger (team_id, created_at desc);

-- ============================================================================
-- 8. payments
-- ============================================================================

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  team_membership_id uuid not null references public.team_memberships(id) on delete cascade,
  amount_inr integer not null check (amount_inr > 0),
  method text, -- UPI / QR / BANK / CASH / OTHER
  status payment_status not null default 'PAYMENT_EXPECTED',
  external_reference text,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.team_memberships
  add constraint fk_team_memberships_payment
  foreign key (payment_id) references public.payments(id);

create trigger trg_payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create index ix_payments_membership on public.payments (team_membership_id);

-- ============================================================================
-- 9. turf_resources
-- ============================================================================

create table public.turf_resources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_turf_resources_updated_at
  before update on public.turf_resources
  for each row execute function public.set_updated_at();

-- ============================================================================
-- 10. turf_slots
-- ============================================================================

create table public.turf_slots (
  id uuid primary key default gen_random_uuid(),
  turf_id uuid not null references public.turf_resources(id) on delete cascade,
  slot_date date not null,
  start_time time not null,
  end_time time not null,
  status turf_slot_status not null default 'AVAILABLE',
  blocked_reason text,
  blocked_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (turf_id, slot_date, start_time),
  check (end_time > start_time)
);

create trigger trg_turf_slots_updated_at
  before update on public.turf_slots
  for each row execute function public.set_updated_at();

create index ix_turf_slots_lookup on public.turf_slots (turf_id, slot_date, status);

-- ============================================================================
-- 11. slot_holds
-- ============================================================================

create table public.slot_holds (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.turf_slots(id) on delete cascade,
  team_id uuid not null references public.teams(id),
  held_by uuid references public.profiles(id),
  status slot_hold_status not null default 'ACTIVE',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index ix_slot_holds_slot on public.slot_holds (slot_id, status);

-- ============================================================================
-- 12. bookings
-- ============================================================================

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id),
  turf_id uuid not null references public.turf_resources(id),
  slot_id uuid not null references public.turf_slots(id),
  hold_id uuid references public.slot_holds(id),
  status booking_status not null default 'HOLDING',
  booking_date date not null,
  start_time time not null,
  end_time time not null,
  duration_hours numeric(4,2) not null check (duration_hours > 0),
  membership_rate_applied integer not null,
  standard_rate_applied integer not null,
  discounted_hours_used numeric(4,2) not null default 0,
  standard_hours_used numeric(4,2) not null default 0,
  total_credits numeric(12,2) not null check (total_credits >= 0),
  created_by uuid references public.profiles(id),
  confirmed_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_bookings_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

create index ix_bookings_team on public.bookings (team_id, created_at desc);
create index ix_bookings_slot on public.bookings (slot_id);
-- One slot may never have two live (non-terminal) bookings.
create unique index uq_bookings_one_live_per_slot
  on public.bookings (slot_id)
  where (status in ('HOLDING', 'CONFIRMED', 'IN_PROGRESS'));

-- ============================================================================
-- 13. booking_participants
-- ============================================================================

create table public.booking_participants (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  status participant_status not null default 'SELECTED',
  added_by uuid references public.profiles(id),
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (booking_id, user_id)
);

create index ix_booking_participants_booking on public.booking_participants (booking_id);
create index ix_booking_participants_user on public.booking_participants (user_id);

-- ============================================================================
-- 14. member_usage_attribution
-- ============================================================================

create table public.member_usage_attribution (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  team_id uuid not null references public.teams(id),
  credits_attributed numeric(12,2) not null,
  participant_count_at_completion integer not null check (participant_count_at_completion > 0),
  created_at timestamptz not null default now(),
  unique (booking_id, user_id)
);

create index ix_usage_attribution_user on public.member_usage_attribution (user_id);
create index ix_usage_attribution_team on public.member_usage_attribution (team_id);

-- ============================================================================
-- 15. chat_rooms
-- ============================================================================

create table public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references public.teams(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 16. chat_messages
-- ============================================================================

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(body) between 1 and 2000),
  is_deleted boolean not null default false,
  created_at timestamptz not null default now()
);

create index ix_chat_messages_room on public.chat_messages (room_id, created_at desc);

-- ============================================================================
-- 17. notifications
-- ============================================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  type text not null,
  title text not null,
  body text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index ix_notifications_user on public.notifications (user_id, created_at desc);

-- ============================================================================
-- 18. admin_audit_logs (append-only)
-- ============================================================================

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id),
  action text not null,
  target_type text,
  target_id uuid,
  reason text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index ix_admin_audit_logs_target on public.admin_audit_logs (target_type, target_id);

-- ============================================================================
-- 19. leaderboard_weekly
-- ============================================================================

create table public.leaderboard_weekly (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  week_end date not null,
  scope text not null check (scope in ('TEAM', 'MEMBER')),
  team_id uuid references public.teams(id),
  user_id uuid references public.profiles(id),
  metric_value numeric(12,2) not null,
  rank integer,
  computed_at timestamptz not null default now(),
  unique (week_start, scope, team_id, user_id)
);

create index ix_leaderboard_weekly_week on public.leaderboard_weekly (week_start, scope);
