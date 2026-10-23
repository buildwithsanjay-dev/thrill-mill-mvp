import { useQuery } from '@tanstack/react-query';

import { fetchRizzfitCategories, fetchRizzfitLeaderboard, fetchRizzfitMatches, type RizzfitMatch } from './rizzfitApi';
import type { LeaderboardRow, TournamentMatch } from './types';

export type CategoryLeaderboard = { category: string; rows: LeaderboardRow[] };

// Both RizzFit's matches and leaderboard endpoints are paginated
// (total/page/limit/offset in the response) — a single capped-limit call
// silently truncates once a tournament has more matches/teams than that
// cap (seen directly against the real dashboard: 237 matches, only the
// first 100 were ever fetched). Page through until every row is in.
const PAGE_SIZE = 100;

// Fetches page 1 to learn the real page size + total, then fires every
// remaining page in parallel instead of one-at-a-time — sequential paging
// was adding a full extra RizzFit round-trip per page (visibly laggy
// opening a tournament with 200+ matches across 3 pages).
async function fetchAllPages<T>(
  fetchPage: (page: number) => Promise<{ data: { total: number; data: T[] } }>
): Promise<T[]> {
  const first = await fetchPage(1);
  const pageLen = first.data.data.length;
  if (pageLen === 0 || pageLen >= first.data.total) return first.data.data;

  const pageCount = Math.ceil(first.data.total / pageLen);
  const rest = await Promise.all(Array.from({ length: pageCount - 1 }, (_, i) => fetchPage(i + 2)));
  return first.data.data.concat(...rest.map((r) => r.data.data));
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
export function useRizzfitMatches(tournamentId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: ['rizzfit-matches', tournamentId],
    queryFn: () =>
      fetchAllPages((page) => fetchRizzfitMatches(tournamentId as number, { limit: PAGE_SIZE, page })),
    enabled: tournamentId !== undefined && enabled,
    // Tournament is actively in progress while this screen is open —
    // scores move. 30s is a reasonable whole-list refresh; a true per-match
    // "LIVE" ticker would need its own faster poll scoped to one match,
    // not this list view (see useRizzfit.ts / CLAUDE.md Phase 2 note on
    // polling cadence).
    refetchInterval: 30_000,
  });
}

// RizzFit's leaderboard endpoint is scoped to one category per call — an
// unscoped call doesn't return everyone combined, it silently returns only
// whichever category RizzFit treats as the default (confirmed directly:
// the owner's "only 20 of 40" report was the Men roster, Women never
// included at all). So fetch the real category list first, then one
// leaderboard per category, kept as separate labeled groups — ranking
// Men against Women in one combined table wouldn't mean anything anyway,
// they never play each other.
export function useRizzfitLeaderboard(tournamentId: number | undefined, enabled = true) {
  return useQuery({
    queryKey: ['rizzfit-leaderboard', tournamentId],
    queryFn: async (): Promise<CategoryLeaderboard[]> => {
      const categories = await fetchRizzfitCategories(tournamentId as number);
      const scopes: { id?: number; name: string }[] = categories.length > 0 ? categories : [{ name: 'Overall' }];

      return Promise.all(
        scopes.map(async (cat) => {
          const items = await fetchAllPages((page) =>
            fetchRizzfitLeaderboard(tournamentId as number, { category: cat.id, limit: PAGE_SIZE, page })
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
          return { category: cat.name, rows };
        })
      );
    },
    enabled: tournamentId !== undefined && enabled,
    staleTime: 60_000,
  });
}
