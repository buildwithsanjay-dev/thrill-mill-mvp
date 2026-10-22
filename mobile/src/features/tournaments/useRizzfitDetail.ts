import { useQuery } from '@tanstack/react-query';

import { fetchRizzfitLeaderboard, fetchRizzfitMatches, type RizzfitMatch } from './rizzfitApi';
import type { LeaderboardRow, TournamentMatch } from './types';

// RizzFit's match detail has no "round"/group label at all (groups only
// exist via match-groups, whose fixtures/teams fields are untyped in their
// own spec — not safe to map until a live tournament lets us smoke-test the
// real shape). Repurposing MatchList's round/footer slot to show live
// status instead is honest about what we actually know per match.
function matchStatusLabel(m: RizzfitMatch): string {
  if (m.hasStarted && !m.hasEnded) return 'LIVE';
  if (m.isCompleted || m.hasEnded) return 'Completed';
  if (m.courtName) return m.courtName;
  if (m.scheduledTime) {
    const d = new Date(m.scheduledTime);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    }
  }
  return 'Upcoming';
}

export function adaptRizzfitMatch(m: RizzfitMatch): TournamentMatch {
  return {
    id: String(m.id),
    teamA: m.teamA?.name ?? 'TBD',
    teamB: m.teamB?.name ?? 'TBD',
    round: matchStatusLabel(m),
    scoreA: m.teamAScore ?? 0,
    scoreB: m.teamBScore ?? 0,
  };
}

// Raw matches (not yet adapted) so the screen can filter by live status
// before mapping to display shape.
export function useRizzfitMatches(tournamentId: number | undefined) {
  return useQuery({
    queryKey: ['rizzfit-matches', tournamentId],
    queryFn: async () => {
      const res = await fetchRizzfitMatches(tournamentId as number, { limit: 100 });
      return res.data.data;
    },
    enabled: tournamentId !== undefined,
    // Tournament is actively in progress while this screen is open —
    // scores move. 30s is a reasonable whole-list refresh; a true per-match
    // "LIVE" ticker would need its own faster poll scoped to one match,
    // not this list view (see useRizzfit.ts / CLAUDE.md Phase 2 note on
    // polling cadence).
    refetchInterval: 30_000,
  });
}

export function useRizzfitLeaderboard(tournamentId: number | undefined) {
  return useQuery({
    queryKey: ['rizzfit-leaderboard', tournamentId],
    queryFn: async () => {
      const res = await fetchRizzfitLeaderboard(tournamentId as number);
      const rows: LeaderboardRow[] = res.data.data
        .slice()
        .sort((a, b) => b.winPercentage - a.winPercentage || b.wins - a.wins)
        .map((item, i) => ({
          rank: i + 1,
          team: item.teamName,
          games: item.totalMatches,
          wins: item.wins,
          losses: item.losses,
        }));
      return rows;
    },
    enabled: tournamentId !== undefined,
    staleTime: 60_000,
  });
}
