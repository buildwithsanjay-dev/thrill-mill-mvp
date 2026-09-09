import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { teamBookingCountsQueryKey } from '@/features/team/useTeams';
import {
  getBooking,
  getBookingParticipants,
  getDefaultTurf,
  getTeamBookings,
  getTurfSlotsForDate,
  getUpcomingBookingsAcrossTeams,
} from './api';

export function useDefaultTurf() {
  return useQuery({ queryKey: ['default-turf'], queryFn: getDefaultTurf, staleTime: 60 * 60 * 1000 });
}

// Dashboard "Other Teams' Upcoming Events" strip — every ACTIVE Team the
// member belongs to, not just the currently selected one. Keyed by userId so
// it never leaks across an account switch on the same device.
export function useUpcomingBookingsAcrossTeams() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: ['upcoming-bookings-all-teams', userId],
    queryFn: () => getUpcomingBookingsAcrossTeams(),
    enabled: !!userId,
  });
}

export function useTurfSlots(turfId: string | undefined, isoDate: string) {
  return useQuery({
    queryKey: ['turf-slots', turfId, isoDate],
    queryFn: () => getTurfSlotsForDate(turfId as string, isoDate),
    enabled: !!turfId,
    refetchInterval: 15_000, // slots move fast (holds/bookings from other members)
  });
}

export function useTeamBookings(teamId: string | undefined) {
  return useQuery({
    queryKey: ['team-bookings', teamId],
    queryFn: () => getTeamBookings(teamId as string),
    enabled: !!teamId,
  });
}

export function useBooking(bookingId: string | undefined) {
  return useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBooking(bookingId as string),
    enabled: !!bookingId,
  });
}

export function useBookingParticipants(bookingId: string | undefined) {
  return useQuery({
    queryKey: ['booking-participants', bookingId],
    queryFn: () => getBookingParticipants(bookingId as string),
    enabled: !!bookingId,
  });
}

export function useInvalidateBookingQueries() {
  const queryClient = useQueryClient();
  return (opts: { teamId?: string; bookingId?: string; turfId?: string }) => {
    if (opts.teamId) {
      queryClient.invalidateQueries({ queryKey: ['team-bookings', opts.teamId] });
      queryClient.invalidateQueries({ queryKey: teamBookingCountsQueryKey(opts.teamId) });
    }
    if (opts.bookingId) {
      queryClient.invalidateQueries({ queryKey: ['booking', opts.bookingId] });
      queryClient.invalidateQueries({ queryKey: ['booking-participants', opts.bookingId] });
    }
    if (opts.turfId) queryClient.invalidateQueries({ queryKey: ['turf-slots', opts.turfId] });
  };
}
