import { useQuery } from '@tanstack/react-query';

import { fetchRizzfitLeaderboard, fetchRizzfitMatches, type RizzfitMatch } from './rizzfitApi';
import type { LeaderboardRow, TournamentMatch } from './types';

// Both RizzFit's matches and leaderboard endpoints are paginated
// (total/page/limit/offset in the response) — a single capped-limit call
// silently truncates once a tournament has more matches/teams than that
// cap (seen directly against the real dashboard: 237 matches, only the
// first 100 were ever fetched). Page through until every row is in.
const PAGE_SIZE = 100;

async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ data: { total: number; data: T[] } }>
): Promise<T[]> {
  let page = 1;
  let all: T[] = [];
  while (true) {
    const res = await fetchPage(page);
    all = all.concat(res.data.data);
    if (res.data.data.length === 0 || all.length >= res.data.total) break;
    page += 1;
  }
  return all;
}

// Normalizes RizzFit's raw courtName (unknown exact format — could be "3"
// or "Court 3") into a consistent "Court 3" label without double-prefixing.
export function courtLabel(courtName?: string): string | undefined {
  const trimmed = courtName?.trim();
  if (!trimmed) return undefined;
  return /^court\b/i.test(trimmed) ? trimmed : `Court ${trimmed}`;
}

// RizzFit's match detail has no "round"/group label at all (groups only
// exist via match-groups, whose fixtures/teams fields are untyped in their
// own spec — not safe to map until a live tournament lets us smoke-test the
// real shape). Repurposing MatchList's round/footer slot to show court +
// live status instead is honest about what we actually know per match —
// and court number matters most exactly while a match is live (the owner's
// own report: a live match on court 3 was showing just "LIVE" with no court
// at all, since this used to return 'LIVE'/'Completed' before ever
// checking courtName).
function matchStatusLabel(m: RizzfitMatch): string {
  const court = courtLabel(m.courtName);
  if (m.hasStarted && !m.hasEnded) return court ? `${court} • Live` : 'Live';
  if (m.isCompleted || m.hasEnded) return court ? `${court} • Completed` : 'Completed';
  if (court) return court;
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
    queryFn: () =>
      fetchAllPages((page) => fetchRizzfitMatches(tournamentId as number, { limit: PAGE_SIZE, page })),
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
      const items = await fetchAllPages((page) =>
        fetchRizzfitLeaderboard(tournamentId as number, { limit: PAGE_SIZE, page })
      );
      const rows: LeaderboardRow[] = items
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
