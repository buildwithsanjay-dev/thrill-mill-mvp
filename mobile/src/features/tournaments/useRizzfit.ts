import { useQuery } from '@tanstack/react-query';

import { MOCK_TOURNAMENTS } from './mockData';
import { fetchRizzfitTournaments, RizzfitNotConfiguredError, type RizzfitTournamentListItem } from './rizzfitApi';
import type { Tournament } from './types';

// RizzFit gives no clean status enum at the list level (`statusName` is a
// publish-workflow label like "Published", not a match-day state) — derive
// Upcoming/Ongoing/Completed the same way the rest of the app treats
// eligibility windows: from real dates, server-trustworthy either way since
// these are RizzFit's own recorded dates, not something a client can edit.
function deriveStatus(startIso: string, endIso: string): Tournament['status'] {
  const now = Date.now();
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (now < start) return 'UPCOMING';
  if (now > end) return 'COMPLETED';
  return 'ONGOING';
}

function toDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function adapt(item: RizzfitTournamentListItem): Tournament {
  return {
    id: `rizzfit-${item.id}`,
    name: item.name,
    // The API's tournament record only carries the organizer's contact
    // email/phone, no display name — every tournament this key can see is
    // ours by construction (RizzFit enforces tenant isolation per-key), so
    // this is a constant, not a guess.
    organizer: 'The Thrill Mill Club',
    venueOrHost: item.location,
    // RizzFit's external API is pickleball-only today (see CLAUDE.md Phase
    // 2 note) — other sports are a later phase, so this is safe to fix.
    sport: 'Pickleball',
    eventType: 'Tournament',
    startDate: toDateOnly(item.startDate),
    endDate: toDateOnly(item.endDate),
    status: deriveStatus(item.startDate, item.endDate),
    isRegistered: false,
  };
}

export type TournamentsFeed = {
  tournaments: Tournament[];
  // false whenever we fell back to preview (mock) data — either RizzFit
  // isn't configured yet (RIZZFIT_API_KEY unset) or the call failed for any
  // other reason. The screen uses this to show a small "preview data"
  // notice rather than silently passing off mock rows as real.
  isLive: boolean;
};

async function loadTournamentsFeed(): Promise<TournamentsFeed> {
  try {
    const res = await fetchRizzfitTournaments({ limit: 100 });
    const tournaments = res.data.listData.map(adapt).sort((a, b) => a.startDate.localeCompare(b.startDate));
    return { tournaments, isLive: true };
  } catch (err) {
    if (!(err instanceof RizzfitNotConfiguredError)) {
      console.warn('[tournaments] RizzFit fetch failed, showing preview data:', err);
    }
    return { tournaments: MOCK_TOURNAMENTS, isLive: false };
  }
}

export function useTournamentsFeed() {
  return useQuery({
    queryKey: ['rizzfit-tournaments'],
    queryFn: loadTournamentsFeed,
    staleTime: 5 * 60 * 1000,
  });
}
