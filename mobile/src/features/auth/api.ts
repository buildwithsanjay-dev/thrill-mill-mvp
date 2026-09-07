import * as WebBrowser from 'expo-web-browser';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { makeRedirectUri } from 'expo-auth-session';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase';

// Required once at module scope so a browser tab opened by
// WebBrowser.openAuthSessionAsync can hand control back to the app — no-op
// on native, needed for web.
WebBrowser.maybeCompleteAuthSession();

// No `scheme`/`useProxy` options: in Expo Go this resolves to an exp://
// address routable back into the running dev session; in a custom dev
// client / standalone build it resolves to the app's own URL scheme. Both
// must be present in Supabase Dashboard -> Authentication -> URL
// Configuration -> Redirect URLs (wildcards like exp://** are fine for the
// Expo Go dev case, since that address changes with the dev machine's IP).
const redirectTo = makeRedirectUri();

async function createSessionFromUrl(url: string): Promise<Session | null> {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) {
    throw new Error(errorCode);
  }

  const { access_token, refresh_token } = params;
  if (!access_token || !refresh_token) {
    return null;
  }

  const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) {
    throw error;
  }
  return data.session;
}

// Guards against a second signInWithGoogle() starting while one is still
// in flight (e.g. a double-tap, or the user backgrounding and returning to
// the app mid-flow and tapping Continue again). Without this, a second
// call generates a fresh PKCE code_verifier that overwrites the first's in
// storage — if the *first* browser tab is still alive somewhere (Android
// can keep a Custom Tab around across task switches) and the user
// completes that one instead, the code exchange fails against the wrong
// verifier. That failure surfaces as an opaque network/server error and,
// combined with the browser tab tearing down mid-flow, can look like the
// app itself crashed.
let isGoogleSignInInFlight = false;

// Browser-redirect Google sign-in (works in plain Expo Go). The backend
// (Supabase Auth + trg_handle_new_auth_user) is what actually creates the
// profiles row and issues the session — this function only drives the
// browser flow and hands the resulting tokens to supabase-js.
export async function signInWithGoogle(): Promise<Session | null> {
  if (isGoogleSignInInFlight) {
    return null;
  }
  isGoogleSignInInFlight = true;

  try {
    // Best-effort: close out any stale auth session left over from a
    // previous incomplete attempt before starting a fresh one.
    try {
      WebBrowser.dismissAuthSession();
    } catch {
      // Not supported on this platform — fine, nothing to clean up.
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) {
      throw error;
    }
    if (!data?.url) {
      throw new Error('OAUTH_URL_MISSING');
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) {
      // User cancelled or dismissed the browser tab — not an error.
      return null;
    }

    return await createSessionFromUrl(result.url);
  } finally {
    isGoogleSignInInFlight = false;
  }
}

// Username/password sign-in, used for Admin access. Supabase Auth has no
// concept of a bare "username" — under the hood every credential here is
// still a real email/password Supabase Auth user, and the app-facing
// "username" is just a client-side alias resolved to that fixed email.
// This mapping is intentionally not a general-purpose feature: it exists
// only for the seeded Admin account (see
// supabase/migrations/20260905094500_seed_admin_user.sql). Any user typing
// a username that isn't in this map gets a clear "unknown username" error
// rather than silently trying (and failing) against a made-up email.
const USERNAME_EMAIL_MAP: Record<string, string> = {
  admin: 'admin@thrillmillclub.internal',
};

export async function signInWithUsername(username: string, password: string): Promise<Session> {
  const email = USERNAME_EMAIL_MAP[username.trim().toLowerCase()];
  if (!email) {
    throw new Error('UNKNOWN_USERNAME');
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    throw error;
  }
  if (!data.session) {
    throw new Error('SIGN_IN_FAILED');
  }
  return data.session;
}

export async function signOut(): Promise<void> {
  // `scope: 'local'` clears the on-device session immediately without
  // waiting on a network round-trip to revoke the refresh token
  // server-side. The default 'global' scope throws (and leaves the app
  // still signed in) if that revoke call can't reach Supabase — exactly
  // the kind of network blip that makes "sign out, sign in as someone
  // else" feel broken on a flaky connection. The refresh token still
  // expires naturally either way.
  const { error } = await supabase.auth.signOut({ scope: 'local' });
  if (error) {
    throw error;
  }
}
