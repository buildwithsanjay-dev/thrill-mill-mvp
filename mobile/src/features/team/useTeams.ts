import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { getMyInvites, getMyTeams, getTeamDetails, getTeamMembers } from './api';

export const myTeamsQueryKey = (userId: string | undefined) => ['my-teams', userId] as const;
export const myInvitesQueryKey = (userId: string | undefined) => ['my-invites', userId] as const;
export const teamDetailsQueryKey = (teamId: string) => ['team-details', teamId] as const;
export const teamMembersQueryKey = (teamId: string) => ['team-members', teamId] as const;

export function useMyInvites() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: myInvitesQueryKey(userId),
    queryFn: getMyInvites,
    enabled: !!userId,
  });
}

export function useMyTeams() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: myTeamsQueryKey(userId),
    queryFn: getMyTeams,
    enabled: !!userId,
  });
}

export function useTeamDetails(teamId: string | undefined) {
  return useQuery({
    queryKey: teamDetailsQueryKey(teamId ?? ''),
    queryFn: () => getTeamDetails(teamId as string),
    enabled: !!teamId,
  });
}

export function useTeamMembers(teamId: string | undefined) {
  return useQuery({
    queryKey: teamMembersQueryKey(teamId ?? ''),
    queryFn: () => getTeamMembers(teamId as string),
    enabled: !!teamId,
  });
}

// Invalidate every query that a team-mutating RPC (invite, join, remove,
// membership activation, booking...) can affect. Cheap and safe to
// over-invalidate here — correctness beats a few extra refetches.
export function useInvalidateTeamQueries() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user.id;

  return (teamId?: string) => {
    queryClient.invalidateQueries({ queryKey: myTeamsQueryKey(userId) });
    queryClient.invalidateQueries({ queryKey: myInvitesQueryKey(userId) });
    if (teamId) {
      queryClient.invalidateQueries({ queryKey: teamDetailsQueryKey(teamId) });
      queryClient.invalidateQueries({ queryKey: teamMembersQueryKey(teamId) });
    }
  };
}
