import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

// Typed client for RizzFit's External Developer API, mirrored from their
// live Swagger spec (uattournament.rizzfitt.com/rizzapi/swagger), read
// 2026-10-22. Every call goes through the `rizzfit` Supabase Edge Function
// (supabase/functions/rizzfit), which holds the club's secret key
// server-side — this file never talks to RizzFit directly, per CLAUDE.md's
// client/server boundary rule.
//
// Pickleball-only, matching RizzFit's own external API surface and the
// project's current scope (other sports are a later phase).

export class RizzfitNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RizzfitNotConfiguredError';
  }
}

// RizzFit's own DTO also carries the organizer's contact `email` and
// `mobileNumber` — the `rizzfit` Edge Function strips both before this ever
// reaches the client, so they're deliberately not in this type.
export interface RizzfitTournamentListItem {
  id: number;
  name: string;
  slug: string;
  location: string;
  startDate: string;
  endDate: string;
  statusName: string;
  updatedOn: string;
}

export interface RizzfitTournamentDetails {
  id: number;
  name: string;
  slug: string;
  location: string;
  startDate: string;
  endDate: string;
  sport?: { id: number; name: string };
  tournamentType?: { id: number; name: string };
  isActive: boolean;
  isRegistration: boolean;
  masterStatusId: number;
}

// Full match/scoring rules config — not wired into any screen yet, kept
// typed and ready for a future "Rules" panel.
export interface RizzfitTournamentConfig {
  id: number;
  tournamentId: number;
  isActive: boolean;
  per_player_game?: number;
  game_type?: string;
  tournament_type?: string;
  no_of_players?: number;
  matchMaxWinningPoints?: number;
  servicePerTeam?: number;
  details?: string;
  isSubstitution?: boolean;
  platform_amount?: number;
  gateway_amount?: number;
  gst?: number;
  isAddTeam?: boolean;
  showPlayerPosition?: boolean;
  showRallyLog?: boolean;
  isGoldenPoint?: boolean;
  isTimeout?: boolean;
}

export interface RizzfitCategory {
  id: number;
  name: string;
  // Free-text participant-count description (e.g. "1 player per team") —
  // there is no structured age-band or per-category fee field anywhere in
  // the API; those only exist on RizzFit's own registration page.
  participants?: string;
  isActive: boolean;
}

export interface RizzfitSponsor {
  id: number;
  tournamentId: number;
  imageUrl: string;
  isActive: boolean;
}

export interface RizzfitTeamPlayer {
  id: number;
  name: string;
  duprRating?: number;
}

export interface RizzfitTeam {
  id: number;
  name: string;
  players?: RizzfitTeamPlayer[];
}

export interface RizzfitMatch {
  id: number;
  matchNo: string;
  courtId?: number;
  courtName?: string;
  hasStarted: boolean;
  isCompleted: boolean;
  hasEnded: boolean;
  isScheduled: boolean;
  teamAScore?: number;
  teamBScore?: number;
  scheduledTime?: string;
  matchStartTime?: string;
  matchEndTime?: string;
  matchDurationMinutes?: number;
  teamA?: RizzfitTeam;
  teamB?: RizzfitTeam;
  score?: string;
  winnerTeamId?: number;
  tournamentId: number;
}

// `fixtures`/`teams` are untyped in RizzFit's own spec (raw `object[]`) —
// deliberately not narrowed further here until a live tournament lets us
// smoke-test the real payload shape. Only `id`/`name` are documented.
export interface RizzfitMatchGroup {
  id: number;
  name: string;
  mappingId?: number;
  fixtures?: unknown[];
  teams?: unknown[];
}

export interface RizzfitKnockoutBracketItem {
  id: number;
  stage: string;
  teamASource?: string;
  teamBSource?: string;
  match?: { id: number; isCompleted: boolean };
  winnerTeam?: { id: number; name: string };
  mapping?: { id: number; categoryId: number; subcategoryId: number };
}

export interface RizzfitLeaderboardItem {
  teamId: number;
  teamName: string;
  mappingId: number;
  category?: { id: number; name: string };
  subCategory?: { id: number; name: string };
  totalMatches: number;
  wins: number;
  losses: number;
  winPercentage: number;
}

type ApiParams = Record<string, string | number | undefined>;

async function callRizzfit<T>(action: string, params: ApiParams = {}): Promise<T> {
  const cleanParams: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) cleanParams[key] = value;
  }

  const { data, error } = await supabase.functions.invoke('rizzfit', {
    body: { action, params: cleanParams },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      const errorBody = await error.context.json().catch(() => null);
      if (errorBody?.code === 'RIZZFIT_NOT_CONFIGURED') {
        throw new RizzfitNotConfiguredError(errorBody.message ?? 'RizzFit integration is not configured yet.');
      }
      throw new Error(errorBody?.message ?? error.message);
    }
    throw error;
  }

  return data as T;
}

export function fetchRizzfitTournaments(params?: {
  limit?: number;
  page?: number;
  // RizzFit also allows sorting by 'mobileNumber'/'email', but since those
  // fields are stripped from the response (see RizzfitTournamentListItem),
  // the app has no reason to ever request sorting by them.
  sortField?: 'name' | 'updatedOn' | 'statusName' | 'tournamentType';
  sortOrder?: 'ASC' | 'DESC';
}) {
  return callRizzfit<{
    success: boolean;
    message: string;
    data: { listData: RizzfitTournamentListItem[]; dataCount: number };
  }>('tournaments', params);
}

export function fetchRizzfitTournamentBySlug(slug: string) {
  return callRizzfit<RizzfitTournamentDetails>('tournament-by-slug', { slug });
}

export function fetchRizzfitTournamentConfig(tournamentId: number) {
  return callRizzfit<RizzfitTournamentConfig>('tournament-config', { tournamentId });
}

export function fetchRizzfitCategories(tournamentId: number) {
  return callRizzfit<RizzfitCategory[]>('tournament-categories', { tournamentId });
}

export function fetchRizzfitSponsors(tournamentId: number) {
  return callRizzfit<{ success: boolean; message: string; data: RizzfitSponsor[] }>('tournament-sponsors', {
    tournamentId,
  });
}

export function fetchRizzfitMatches(
  tournamentId: number,
  params?: {
    matchType?: 'all' | 'upcoming' | 'live' | 'past';
    category?: number;
    subCategory?: number;
    date?: string;
    courtId?: number;
    page?: number;
    limit?: number;
  }
) {
  return callRizzfit<{
    message: string;
    data: { total: number; page: number; limit: number; offset: number; data: RizzfitMatch[] };
  }>('matches', { tournamentId, ...params });
}

export function fetchRizzfitMatch(id: number) {
  return callRizzfit<RizzfitMatch>('match', { id });
}

export function fetchRizzfitMatchGroups(
  tournamentId: number,
  params?: { category?: number; subCategory?: number; group_id?: number }
) {
  return callRizzfit<RizzfitMatchGroup[]>('match-groups', { tournamentId, ...params });
}

export function fetchRizzfitKnockoutBracket(
  tournamentId: number,
  params: { category: number; subCategory: number; cupType?: string }
) {
  return callRizzfit<RizzfitKnockoutBracketItem[]>('match-knockout', { tournamentId, ...params });
}

export function fetchRizzfitLeaderboard(tournamentId: number, params?: { category?: number; subCategory?: number }) {
  return callRizzfit<{
    message: string;
    data: { total: number; page: number; limit: number; offset: number; data: RizzfitLeaderboardItem[] };
  }>('leaderboard', { tournamentId, ...params });
}
