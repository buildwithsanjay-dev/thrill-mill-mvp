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
  // actually exists. Keyed by phone number, not Team membership: a guest
  // who registered on RizzFit and signed in with the same number sees
  // this regardless of whether they've ever joined or created a Team.
  isRegistered: boolean;
};

// Completed-tournament detail shapes — mirror RizzFit's own Fixtures /
// Knockout Bracket / Past->Leaderboard tabs exactly (see
// tournament.rizzfitt.com/Logesh/dpl/dplpickleball/pickleball/matches),
// so swapping mock data for the real API later is a data-source change,
// not a UI rebuild. Only populated for COMPLETED mock tournaments for now;
// Upcoming/Ongoing detail (registration-style: pamphlet, guidelines,
// WhatsApp link, categories+fees) is a separate, later pass.
export type TournamentMatch = {
  id: string;
  teamA: string;
  teamB: string;
  round: string; // e.g. 'Prelims' — free text, matches RizzFit's own labels
  scoreA: number;
  scoreB: number;
};

export type GroupStanding = {
  team: string;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
};

export type TournamentGroup = {
  name: string; // 'Group A'
  matches: TournamentMatch[];
  standings: GroupStanding[]; // already sorted, best first
};

export type BracketMatch = {
  id: string;
  // Each slot is either a decided team name, or a placeholder like
  // "#1 Group A" / "W Semifinal 1" for a slot not yet reached in the mock.
  top: string;
  bottom: string;
  winner?: 'top' | 'bottom';
};

export type BracketRound = {
  name: string; // 'Quarterfinal' | 'Semifinal' | 'Final'
  matches: BracketMatch[];
};

export type LeaderboardRow = {
  rank: number;
  team: string;
  games: number;
  wins: number;
  losses: number;
};

export type TournamentDetail = {
  tournamentId: string;
  groups: TournamentGroup[];
  bracket: BracketRound[];
  leaderboard: LeaderboardRow[];
};
