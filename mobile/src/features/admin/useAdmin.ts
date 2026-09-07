import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getAllBookings,
  getAllTeams,
  getDashboardStats,
  getPendingActivationTeams,
  getRecentAuditLog,
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

export function useRecentAuditLog() {
  return useQuery({ queryKey: ['admin', 'audit-log'], queryFn: () => getRecentAuditLog() });
}

export function useAllBookings() {
  return useQuery({ queryKey: ['admin', 'bookings'], queryFn: getAllBookings });
}

export function useInvalidateAdminQueries() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['admin'] });
}
