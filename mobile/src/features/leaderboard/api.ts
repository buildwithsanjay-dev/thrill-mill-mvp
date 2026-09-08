import { supabase } from '@/lib/supabase';
import type { CreditUsageLogRow, LiveLeaderboardRow } from '@/types/db';

export type LeaderboardPeriod = 'WEEK' | 'MONTH';

// Live-computed standings for the current (possibly partial) Week or Month —
// fn_leaderboard_live self-heals any booking whose session has actually
// ended (server time) into COMPLETED + member_usage_attribution first, then
// aggregates. This intentionally does NOT read the leaderboard_weekly
// snapshot table: that table is only ever populated by the Admin/cron-driven
// fn_compute_weekly_leaderboard RPC, so it stays empty absent an Admin
// manually running it, which would make the current week's leaderboard look
// perpetually empty even with real completed bookings.
export async function getLiveLeaderboard(
  scope: 'TEAM' | 'MEMBER',
  period: LeaderboardPeriod
): Promise<LiveLeaderboardRow[]> {
  const { data, error } = await supabase.rpc('fn_leaderboard_live', {
    p_scope: scope,
    p_period: period,
  });
  if (error) throw error;
  return (data ?? []) as LiveLeaderboardRow[];
}

// The caller's own per-booking credit-usage attribution rows (analytics
// only — never a Team-wallet split), Week or Month filtered, for the
// Profile screen's Credit Usage log.
export async function getMyCreditUsageLog(period: LeaderboardPeriod): Promise<CreditUsageLogRow[]> {
  const { data, error } = await supabase.rpc('fn_my_credit_usage_log', { p_period: period });
  if (error) throw error;
  return (data ?? []) as CreditUsageLogRow[];
}
