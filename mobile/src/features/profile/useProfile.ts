import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { getMyProfile } from './api';

export const profileQueryKey = (userId: string | undefined) => ['profile', userId] as const;

// Server state — always refetched, never trusted from a cache for anything
// beyond UI convenience (e.g. the onboarding redirect gate re-checks this,
// it doesn't hardcode a "seen onboarding" flag client-side).
export function useProfile() {
  const { session } = useAuth();
  const userId = session?.user.id;

  return useQuery({
    queryKey: profileQueryKey(userId),
    queryFn: getMyProfile,
    enabled: !!userId,
  });
}
