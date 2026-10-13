import { useQuery } from '@tanstack/react-query';

import { getLiveLeaderboard, getMyCreditUsageLog, type LeaderboardPeriod } from './api';

export function useLeaderboard(scope: 'TEAM' | 'MEMBER', period: LeaderboardPeriod, offset = 0) {
  return useQuery({
    queryKey: ['leaderboard', scope, period, offset],
    queryFn: () => getLiveLeaderboard(scope, period, offset),
  });
}

export function useMyCreditUsageLog(period: LeaderboardPeriod) {
  return useQuery({
    queryKey: ['my-credit-usage-log', period],
    queryFn: () => getMyCreditUsageLog(period),
  });
}
