// Shell types for the Tournaments tab — RizzFit's API isn't available yet
// (see docs/phase2-tournament-memory-engine.md §6 / CLAUDE.md Phase 2 note),
// so this models only what the UI needs to render the four sections. Real
// fields (registration, fixtures, rosters) arrive once their Swagger spec
// does; nothing here is persisted or fetched from our own backend.
export type TournamentStatus = 'ONGOING' | 'UPCOMING' | 'COMPLETED';

export type TournamentSport = 'Pickleball' | 'Turf/Football' | 'Cricket';

export type Tournament = {
  id: string;
  name: string;
  organizer: string;
  venueOrHost: string;
  sport: TournamentSport;
  eventType: 'Tournament' | 'League' | 'Event' | 'Workshop';
  startDate: string; // ISO date
  endDate: string; // ISO date
  status: TournamentStatus;
  // True once a RizzFit registration under the signed-in user's phone
  // number is found for this tournament — always false until that lookup
  // actually exists.
  isRegistered: boolean;
};
