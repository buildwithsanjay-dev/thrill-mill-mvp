// Shared TS types mirroring supabase/migrations/*.sql. Kept hand-written
// (not generated) — small enough surface for now that generation isn't
// worth the extra toolchain step yet; revisit with
// `mcp__supabase__generate_typescript_types` if this drifts.

export type TeamRole = 'HOST' | 'CO_HOST' | 'MEMBER';
export type TeamMemberStatus = 'INVITED' | 'PENDING' | 'ACTIVE' | 'REMOVED' | 'REJECTED' | 'LEFT';
export type TeamStatus = 'CREATED' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type MembershipRequestStatus =
  | 'PLAN_SELECTED'
  | 'REQUEST_SUBMITTED'
  | 'PAYMENT_PENDING'
  | 'ADMIN_REVIEW'
  | 'PAYMENT_VERIFIED'
  | 'ACTIVE';
export type BookingStatus =
  | 'HOLDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'FAILED';
export type TurfSlotStatus = 'AVAILABLE' | 'HELD' | 'CONFIRMED' | 'BLOCKED';
export type ParticipantStatus = 'SELECTED' | 'LOCKED' | 'COMPLETED' | 'REMOVED';
export type WalletLedgerEntryType =
  | 'MEMBERSHIP_CREDIT'
  | 'BOOKING_CONSUME'
  | 'BOOKING_REFUND'
  | 'ADMIN_ADJUSTMENT';

export type Team = {
  id: string;
  name: string;
  status: TeamStatus;
  created_by: string | null;
  join_code: string;
  banner_url: string | null;
  created_at: string;
};

export type TeamMember = {
  id: string;
  team_id: string;
  user_id: string;
  team_role: TeamRole;
  status: TeamMemberStatus;
  invited_by: string | null;
  joined_at: string | null;
  created_at: string;
  // joined from profiles, when selected with a join
  profile?: { full_name: string | null; avatar_url: string | null; phone: string | null } | null;
};

export type MembershipPlan = {
  id: string;
  code: string;
  name: string;
  price_inr: number;
  credits_allocated: number;
  discounted_hours_cap_per_24h: number | null;
  membership_day_rate_per_hour: number;
  membership_night_rate_per_hour: number;
  standard_day_rate_per_hour: number;
  standard_night_rate_per_hour: number;
  is_active: boolean;
};

export type TeamMembership = {
  id: string;
  team_id: string;
  plan_id: string;
  status: MembershipRequestStatus;
  payment_id: string | null;
  host_phone: string | null;
  co_host_phone: string | null;
  created_at: string;
  plan?: MembershipPlan;
};

export type TeamWallet = {
  id: string;
  team_id: string;
  available_credits: number;
  reserved_credits: number;
};

export type WalletLedgerEntry = {
  id: string;
  team_id: string;
  entry_type: WalletLedgerEntryType;
  amount: number;
  balance_after: number;
  reference_type: string | null;
  reason: string | null;
  created_at: string;
};

export type TurfResource = {
  id: string;
  name: string;
  description: string | null;
};

export type TurfSlot = {
  id: string;
  turf_id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  status: TurfSlotStatus;
};

export type Booking = {
  id: string;
  team_id: string;
  turf_id: string;
  slot_id: string;
  hold_id: string | null;
  status: BookingStatus;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  total_credits: number;
  created_by: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  turf?: TurfResource;
};

export type BookingParticipant = {
  id: string;
  booking_id: string;
  user_id: string;
  status: ParticipantStatus;
  profile?: { full_name: string | null; avatar_url: string | null } | null;
};

export type LeaderboardRow = {
  id: string;
  week_start: string;
  week_end: string;
  scope: 'TEAM' | 'MEMBER';
  team_id: string | null;
  user_id: string | null;
  metric_value: number;
  rank: number | null;
  team?: { name: string } | null;
  user?: { full_name: string | null; avatar_url: string | null } | null;
};

// Row shape returned by fn_leaderboard_live(scope, period) — computed live
// for the current (possibly partial) Week/Month, not the precomputed
// leaderboard_weekly snapshot (that table is only ever populated by an
// Admin/cron-driven RPC and stays empty otherwise).
export type LiveLeaderboardRow = {
  rank_no: number;
  subject_id: string;
  display_name: string | null;
  avatar_url: string | null;
  metric_value: number;
  period_start: string;
  period_end: string;
};

// Row shape returned by fn_my_credit_usage_log(period) for the Profile
// screen's Credit Usage section — analytics only, the caller's own
// member_usage_attribution rows.
export type CreditUsageLogRow = {
  booking_id: string;
  team_id: string;
  team_name: string | null;
  booking_date: string;
  start_time: string;
  end_time: string;
  credits_attributed: number;
  participant_count_at_completion: number;
};
