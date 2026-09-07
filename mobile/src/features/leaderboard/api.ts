import { supabase } from '@/lib/supabase';
import type { LeaderboardRow } from '@/types/db';

// Most recent computed week for the given scope — fn_compute_weekly_leaderboard
// (an Admin/cron-driven RPC, not called from the client) is what populates
// this table, so the client only ever reads it.
export async function getLatestLeaderboard(scope: 'TEAM' | 'MEMBER'): Promise<LeaderboardRow[]> {
  const { data: latest, error: latestError } = await supabase
    .from('leaderboard_weekly')
    .select('week_start')
    .eq('scope', scope)
    .order('week_start', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  if (!latest) return [];

  const { data, error } = await supabase
    .from('leaderboard_weekly')
    .select(
      scope === 'TEAM'
        ? '*, team:teams(name)'
        : '*, user:profiles(full_name, avatar_url)'
    )
    .eq('scope', scope)
    .eq('week_start', latest.week_start)
    .order('rank', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as LeaderboardRow[];
}
