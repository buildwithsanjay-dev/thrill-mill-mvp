// Server-side proxy to RizzFit's External Developer API (pickleball
// tournaments only for now — other sports are a later phase per CLAUDE.md's
// Phase 2 note). Holds the club's RizzFit secret key (RIZZFIT_API_KEY, set
// via `supabase secrets set` — never committed, never shipped to the mobile
// bundle) so the client never touches it directly, consistent with this
// project's client/server boundary rule.
//
// Deploying without --no-verify-jwt only confirms the caller sent a
// validly-signed Supabase JWT — the public anon key (shipped in every app
// build by design) IS one, so platform-level verification alone does not
// mean a real signed-in user. We additionally call auth.getUser() below and
// reject anyone who isn't an actual authenticated user.
//
// Confirmed against RizzFit's live Swagger spec
// (uattournament.rizzfitt.com/rizzapi/swagger) on 2026-10-22: every
// endpoint below is GET-only and tenant-scoped automatically to whichever
// organizer account RIZZFIT_API_KEY belongs to (cross-tenant access 403s on
// their side) — there is no webhook, so this is called on demand by the
// app, never pushed to.
//
// Deliberately not a generic proxy: `action` must be one of the entries in
// ACTIONS below, each with a fixed upstream path template and an explicit
// allow-list of query params — combined with the id/slug format validation
// below, this can never be redirected to an arbitrary host or path carrying
// our secret key (an open SSRF relay).

import { createClient } from 'jsr:@supabase/supabase-js@2';

const RIZZFIT_BASE_URL = Deno.env.get('RIZZFIT_BASE_URL') ?? 'https://uattournament.rizzfitt.com/rizzapi';
const RIZZFIT_API_KEY = Deno.env.get('RIZZFIT_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

type Params = Record<string, string | number>;

type PathParamKind = 'id' | 'slug';

type ActionDef = {
  path: (p: Params) => string;
  pathParams: Record<string, PathParamKind>;
  queryParams: string[];
  requiredQueryParams?: string[];
};

const ID_PATTERN = /^\d+$/;
const SLUG_PATTERN = /^[a-z0-9-]+$/i;

function isValidPathParam(kind: PathParamKind, value: unknown): boolean {
  const str = String(value);
  return kind === 'id' ? ID_PATTERN.test(str) : SLUG_PATTERN.test(str);
}

const ACTIONS: Record<string, ActionDef> = {
  tournaments: {
    path: () => '/external/v1/tournament/fetch',
    pathParams: {},
    queryParams: ['limit', 'page', 'sortField', 'sortOrder'],
  },
  'tournament-by-slug': {
    path: (p) => `/external/v1/tournament/by-slug/${encodeURIComponent(p.slug)}`,
    pathParams: { slug: 'slug' },
    queryParams: [],
  },
  'tournament-config': {
    path: (p) => `/external/v1/tournament/config/${encodeURIComponent(p.tournamentId)}`,
    pathParams: { tournamentId: 'id' },
    queryParams: [],
  },
  'tournament-categories': {
    path: (p) => `/external/v1/tournament/categories/${encodeURIComponent(p.tournamentId)}`,
    pathParams: { tournamentId: 'id' },
    queryParams: [],
  },
  'tournament-sponsors': {
    path: (p) => `/external/v1/tournament/sponsors/${encodeURIComponent(p.tournamentId)}`,
    pathParams: { tournamentId: 'id' },
    queryParams: [],
  },
  matches: {
    path: (p) => `/external/v1/pickleball/matches/fetchall/${encodeURIComponent(p.tournamentId)}`,
    pathParams: { tournamentId: 'id' },
    queryParams: ['matchType', 'category', 'subCategory', 'date', 'courtId', 'page', 'limit'],
  },
  match: {
    path: (p) => `/external/v1/pickleball/matches/${encodeURIComponent(p.id)}`,
    pathParams: { id: 'id' },
    queryParams: [],
  },
  'match-groups': {
    path: (p) => `/external/v1/pickleball/matches/groups/fetchall/${encodeURIComponent(p.tournamentId)}`,
    pathParams: { tournamentId: 'id' },
    queryParams: ['category', 'subCategory', 'group_id'],
  },
  'match-knockout': {
    path: (p) => `/external/v1/pickleball/matches/knockout/fetchall/${encodeURIComponent(p.tournamentId)}`,
    pathParams: { tournamentId: 'id' },
    queryParams: ['category', 'subCategory', 'cupType'],
    requiredQueryParams: ['category', 'subCategory'],
  },
  leaderboard: {
    path: (p) => `/external/v1/leaderboard/pickleball/fetchall/${encodeURIComponent(p.tournamentId)}`,
    pathParams: { tournamentId: 'id' },
    queryParams: ['category', 'subCategory'],
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function isEmpty(v: unknown): boolean {
  return v === undefined || v === null || v === '';
}

// The `tournaments` action is the only one whose upstream payload carries
// PII (the organizer's own contact email/phone, on
// ExternalTournamentListItemDto) — strip it before it ever reaches the
// client. Every other action's DTOs only carry tournament/match/team data.
function stripPii(action: string, data: unknown): unknown {
  if (action !== 'tournaments' || !data || typeof data !== 'object') return data;
  const payload = data as { data?: { listData?: Record<string, unknown>[] } };
  if (!Array.isArray(payload.data?.listData)) return data;
  payload.data.listData = payload.data.listData.map((item) => {
    const { email: _email, mobileNumber: _mobileNumber, ...rest } = item;
    return rest;
  });
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ code: 'METHOD_NOT_ALLOWED', message: 'Use POST with a JSON body.' }, 405);
  }

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) {
    return json({ code: 'UNAUTHORIZED', message: 'Sign in required.' }, 401);
  }

  let body: { action?: string; params?: Params };
  try {
    body = await req.json();
  } catch {
    return json({ code: 'BAD_REQUEST', message: 'Invalid JSON body.' }, 400);
  }

  const action = body.action ?? '';
  const def = ACTIONS[action];
  if (!def) {
    return json({ code: 'UNKNOWN_ACTION', message: `Unknown action: ${action}` }, 400);
  }

  if (!RIZZFIT_API_KEY) {
    return json(
      {
        code: 'RIZZFIT_NOT_CONFIGURED',
        message: 'RizzFit integration is not set up yet — RIZZFIT_API_KEY has not been configured.',
      },
      503
    );
  }

  const params = body.params ?? {};

  for (const key of [...Object.keys(def.pathParams), ...(def.requiredQueryParams ?? [])]) {
    if (isEmpty(params[key])) {
      return json({ code: 'BAD_REQUEST', message: `Missing required param: ${key}` }, 400);
    }
  }

  const pathParams: Params = {};
  for (const [key, kind] of Object.entries(def.pathParams)) {
    if (!isValidPathParam(kind, params[key])) {
      return json({ code: 'BAD_REQUEST', message: `Invalid ${key}.` }, 400);
    }
    pathParams[key] = params[key];
  }

  const url = new URL(RIZZFIT_BASE_URL + def.path(pathParams));
  for (const key of def.queryParams) {
    if (!isEmpty(params[key])) url.searchParams.set(key, String(params[key]));
  }

  let upstream: Response;
  try {
    upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'x-api-key': RIZZFIT_API_KEY, Accept: 'application/json' },
    });
  } catch {
    return json({ code: 'RIZZFIT_UNREACHABLE', message: 'Could not reach RizzFit.' }, 502);
  }

  const text = await upstream.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  return json(stripPii(action, data), upstream.status);
});
