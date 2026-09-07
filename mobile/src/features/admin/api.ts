import { supabase } from '@/lib/supabase';
import type { Team, TeamMembership, TeamRole, TeamWallet } from '@/types/db';

// Every read here relies on RLS's `fn_is_admin()` branch (teams_select,
// team_wallets_select, team_memberships_select, bookings_select, etc. all
// have `OR fn_is_admin()`) — an Admin session can plain-select across every
// Team, no RPC needed for reads. Writes that mutate state still go through
// SECURITY DEFINER RPCs (see supabase/migrations/20260905120000_*.sql) so
// every sensitive action still gets its ledger/audit-log entry.

export type DashboardStats = {
  activeNetworks: number;
  pendingRequests: number;
  todaysBookings: number;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const today = new Date().toISOString().slice(0, 10);
  const [{ count: activeNetworks }, { count: pendingRequests }, { count: todaysBookings }] = await Promise.all([
    supabase.from('teams').select('id', { count: 'exact', head: true }).eq('status', 'ACTIVE'),
    supabase
      .from('team_memberships')
      .select('id', { count: 'exact', head: true })
      .in('status', ['REQUEST_SUBMITTED', 'PAYMENT_PENDING', 'ADMIN_REVIEW']),
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('booking_date', today)
      .in('status', ['CONFIRMED', 'IN_PROGRESS']),
  ]);
  return {
    activeNetworks: activeNetworks ?? 0,
    pendingRequests: pendingRequests ?? 0,
    todaysBookings: todaysBookings ?? 0,
  };
}

export type AdminTeamRow = {
  team: Team;
  memberCount: number;
  membership: TeamMembership | null;
};

export async function getAllTeams(): Promise<AdminTeamRow[]> {
  const { data: teams, error } = await supabase.from('teams').select('*').order('created_at', { ascending: false });
  if (error) throw error;

  return Promise.all(
    (teams ?? []).map(async (team) => {
      const [{ count: memberCount }, { data: membership }] = await Promise.all([
        supabase
          .from('team_members')
          .select('id', { count: 'exact', head: true })
          .eq('team_id', team.id)
          .eq('status', 'ACTIVE'),
        supabase
          .from('team_memberships')
          .select('*, plan:membership_plans(*)')
          .eq('team_id', team.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      return {
        team: team as Team,
        memberCount: memberCount ?? 0,
        membership: (membership as unknown as TeamMembership | null) ?? null,
      };
    })
  );
}

export async function getPendingActivationTeams(): Promise<AdminTeamRow[]> {
  const all = await getAllTeams();
  return all.filter((row) => row.membership && row.membership.status !== 'ACTIVE');
}

export async function getRecentAuditLog(limit = 10) {
  const { data, error } = await supabase
    .from('admin_audit_logs')
    .select('id, action, reason, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export type AdminMemberSearchResult = { id: string; full_name: string | null; avatar_url: string | null; phone: string | null };

// Unlike the member-side fn_lookup_user_by_phone (exact match only, one
// narrow SECURITY DEFINER function so a regular member can't browse the
// whole user base), an Admin session already has RLS-level visibility into
// every profile — this is a plain filtered select, not a new privilege.
export async function adminSearchMembers(query: string): Promise<AdminMemberSearchResult[]> {
  if (!query.trim()) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, phone')
    .or(`full_name.ilike.%${query}%,phone.ilike.%${query}%`)
    .limit(10);
  if (error) throw error;
  return (data ?? []) as AdminMemberSearchResult[];
}

// -- Admin-assisted Create Network wizard ---------------------------------

export async function adminCreateTeam(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('fn_admin_create_team', { p_name: name });
  if (error) throw error;
  return data as string;
}

export async function adminAddTeamMember(teamId: string, userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('fn_admin_add_team_member', {
    p_team_id: teamId,
    p_user_id: userId,
  });
  if (error) throw error;
  return data as string;
}

export async function adminSetTeamRole(teamId: string, userId: string, role: TeamRole): Promise<void> {
  const { error } = await supabase.rpc('fn_admin_set_team_role', {
    p_team_id: teamId,
    p_user_id: userId,
    p_role: role,
  });
  if (error) throw error;
}

// -- Membership activation --------------------------------------------------

export async function activateMembership(paymentId: string, externalReference?: string): Promise<void> {
  const { error } = await supabase.rpc('fn_admin_verify_payment', {
    p_payment_id: paymentId,
    p_external_reference: externalReference ?? null,
  });
  if (error) throw error;
}

// -- Admin bookings ----------------------------------------------------------

export type AdminBookingRow = {
  id: string;
  status: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  team_id: string;
  turf_id: string;
  total_credits: number;
  turf: { name: string } | null;
  team: { name: string } | null;
  participant_count: number;
};

export async function getAllBookings(): Promise<AdminBookingRow[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(
      'id, status, booking_date, start_time, end_time, team_id, turf_id, total_credits, turf:turf_resources(name), team:teams(name)'
    )
    .order('booking_date', { ascending: false })
    .order('start_time', { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as Omit<AdminBookingRow, 'participant_count'>[];
  return Promise.all(
    rows.map(async (row) => {
      const { count } = await supabase
        .from('booking_participants')
        .select('id', { count: 'exact', head: true })
        .eq('booking_id', row.id)
        .neq('status', 'REMOVED');
      return { ...row, participant_count: count ?? 0 };
    })
  );
}

export async function findTeamByJoinCodeOrName(query: string): Promise<(Team & { wallet: TeamWallet | null })[]> {
  const { data, error } = await supabase
    .from('teams')
    .select('*')
    .or(`join_code.ilike.%${query}%,name.ilike.%${query}%`)
    .eq('status', 'ACTIVE')
    .limit(10);
  if (error) throw error;

  return Promise.all(
    (data ?? []).map(async (team) => {
      const { data: wallet } = await supabase.from('team_wallets').select('*').eq('team_id', team.id).maybeSingle();
      return { ...(team as Team), wallet: (wallet as TeamWallet | null) ?? null };
    })
  );
}

export async function adminConfirmBookingForHost(holdId: string): Promise<string> {
  const { data, error } = await supabase.rpc('fn_admin_confirm_booking_for_host', { p_hold_id: holdId });
  if (error) throw error;
  return data as string;
}

// -- Block / unblock Turf slots ----------------------------------------------

export async function adminBlockSlot(slotId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('fn_admin_block_slot', { p_slot_id: slotId, p_reason: reason });
  if (error) throw error;
}

export async function adminUnblockSlot(slotId: string): Promise<void> {
  const { error } = await supabase.rpc('fn_admin_unblock_slot', { p_slot_id: slotId });
  if (error) throw error;
}

// -- Cancel a booking (Admin) -------------------------------------------------

// Same fn_cancel_booking RPC the Host/Co-host cancel flow uses
// (mobile/src/features/booking/api.ts) — it already authorizes
// `fn_is_team_host_or_cohost(team_id) or fn_is_admin()`, so an Admin can
// cancel ANY team's booking through it with the exact same server-time
// refund-eligibility logic. Returns the actual outcome
// ('CANCELLED_REFUNDED' | 'CANCELLED_NO_REFUND') — never assume a refund
// happened.
export async function adminCancelBooking(bookingId: string, reason?: string): Promise<string> {
  const { data, error } = await supabase.rpc('fn_cancel_booking', {
    p_booking_id: bookingId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return data as string;
}

// -- Revenue analytics ---------------------------------------------------------

export type RevenueAnalyticsDay = {
  day: string;
  revenue_inr: number;
  credits_consumed: number;
  bookings_count: number;
};

export type RevenueAnalyticsSummary = {
  total_revenue_inr: number;
  total_credits_consumed: number;
  active_memberships: number;
  total_bookings: number;
  bookings_this_week: number;
  bookings_last_week: number;
  period_revenue_inr: number;
  period_credits_consumed: number;
  period_bookings_count: number;
};

export type RevenueAnalytics = {
  period_days: number;
  range_start: string;
  range_end: string;
  summary: RevenueAnalyticsSummary;
  daily: RevenueAnalyticsDay[];
};

export async function getAdminRevenueAnalytics(days = 30): Promise<RevenueAnalytics> {
  const { data, error } = await supabase.rpc('fn_admin_revenue_analytics', { p_days: days });
  if (error) throw error;
  return data as RevenueAnalytics;
}
