import { useQuery } from '@tanstack/react-query';

import { getLatestLeaderboard } from './api';

export function useLeaderboard(scope: 'TEAM' | 'MEMBER') {
  return useQuery({
    queryKey: ['leaderboard', scope],
    queryFn: () => getLatestLeaderboard(scope),
  });
}
