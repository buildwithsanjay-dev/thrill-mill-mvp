import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getAdminAuditLogFeed,
  getAdminRevenueAnalytics,
  getAdminTeamLeaderboard,
  getAllBookings,
  getAllTeams,
  getDashboardStats,
  getPendingActivationTeams,
  type AuditLogFilters,
} from './api';

export function useDashboardStats() {
  return useQuery({ queryKey: ['admin', 'stats'], queryFn: getDashboardStats });
}

export function useAllTeams() {
  return useQuery({ queryKey: ['admin', 'teams'], queryFn: getAllTeams });
}

export function usePendingActivationTeams() {
  return useQuery({ queryKey: ['admin', 'teams', 'pending'], queryFn: getPendingActivationTeams });
}

// Enriched feed (actor name + resolved team/member/turf target name) backed
// by fn_admin_audit_log_feed — used by the Home dashboard's "Recent
// Activity" (small limit, no filters) and the Leaderboard tab's "Admin
// Logs" view (larger limit + filters).
export function useAdminAuditLogFeed(limit = 20, filters: AuditLogFilters = {}) {
  return useQuery({
    queryKey: [
      'admin',
      'audit-log-feed',
      limit,
      filters.action ?? null,
      filters.dateFrom ?? null,
      filters.dateTo ?? null,
      filters.teamId ?? null,
    ],
    queryFn: () => getAdminAuditLogFeed(limit, filters),
  });
}

export function useAllBookings() {
  return useQuery({ queryKey: ['admin', 'bookings'], queryFn: getAllBookings });
}

export function useAdminRevenueAnalytics(days = 30) {
  return useQuery({
    queryKey: ['admin', 'revenue-analytics', days],
    queryFn: () => getAdminRevenueAnalytics(days),
  });
}

export function useAdminTeamLeaderboard(range: 'week' | 'month' = 'week') {
  return useQuery({
    queryKey: ['admin', 'team-leaderboard', range],
    queryFn: () => getAdminTeamLeaderboard(range),
  });
}

export function useInvalidateAdminQueries() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['admin'] });
}
