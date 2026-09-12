import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';

import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useActiveTeamStore } from '@/stores/activeTeam';
import { useAdminBookingDraft } from '@/stores/adminBookingDraft';
import { useAdminTeamWizard } from '@/stores/adminTeamWizard';
import { useCreateTeamWizard } from '@/stores/createTeamWizard';
import { createSessionFromUrl } from '@/features/auth/api';
import { registerForPushNotificationsAsync } from '@/features/notifications/pushToken';

// This context exists purely to gate navigation (logged in vs. not) and to
// know *who* is calling. It is NOT a source of authorization truth — no
// screen may branch on a role or permission read from here. Every
// permission-sensitive read/write is re-derived server-side (RLS + RPC
// checks), per CLAUDE.md's Authentication/Authorization Rules.
type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      lastUserId.current = data.session?.user.id ?? null;
      setSession(data.session);
      setIsLoading(false);
      // Best-effort, never blocks app load — a user already signed in when
      // the app opens still needs a fresh push token registered. Stays
      // silent for every outcome except a real 'error' (the function itself
      // never throws now, it returns a discriminated result) — this call
      // has no UI surface to show feedback from; a user-initiated retry path
      // exists via the Profile screen's notification row instead.
      if (data.session) {
        registerForPushNotificationsAsync().then((result) => {
          if (result.status === 'error') {
            console.warn('[push] background token refresh failed on cold start:', result.error);
          }
        });
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const newUserId = newSession?.user.id ?? null;
      // Deliberately NOT calling registerForPushNotificationsAsync() here for
      // a fresh sign-in — that would fire the raw OS permission popup
      // instantly, before the onboarding flow's own Permissions screen (see
      // (auth)/permissions.tsx) gets a chance to explain why first. A brand
      // new sign-in's registration is owned by that screen instead; this
      // provider stays permission-agnostic, matching its own "gate
      // navigation only" scope note above. The cold-start branch in
      // getSession().then(...) above still auto-registers for an ALREADY
      // signed-in returning session — permission state is already settled
      // by then (granted/denied), so there's no priming moment to protect.
      // Every cached query (profile, teams, wallets, bookings...) is keyed
      // by the previous user's data. Switching accounts — sign-out,
      // sign-in as someone else, or even a silent token refresh landing on
      // a different user — must never let one account's screens render
      // with a stale slice of another account's data while fresh queries
      // are still in flight.
      if (newUserId !== lastUserId.current) {
        queryClient.clear();
        // Zustand stores are client-only UI/draft state, but they can hold
        // references (a selected Team id, a mid-flow wizard draft) that are
        // only valid for the account that created them. Left in place across
        // an account switch, activeTeamId can point at a Team the new
        // session isn't even a member of, and a wizard draft can resume
        // mid-flow with another user's picks. Reset every live store on the
        // same trigger as the query cache clear above.
        useActiveTeamStore.getState().reset();
        useCreateTeamWizard.getState().reset();
        useAdminTeamWizard.getState().reset();
        useAdminBookingDraft.getState().reset();
        lastUserId.current = newUserId;
      }
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Safety net for Google sign-in on Android, independent of
  // signInWithGoogle()'s own WebBrowser.openAuthSessionAsync() call: that
  // call's returned promise only resolves if the SAME JS context that
  // started it is still alive when the browser redirects back. A brand-new
  // Google account's first-time consent flow (extra "choose account" /
  // permissions screens) takes noticeably longer, and on a memory-
  // constrained or aggressively battery-optimized Android device (MIUI in
  // particular), the OS can kill the backgrounded app process during that
  // longer flow — the redirect still arrives as a deep link, but into a
  // freshly cold-started app whose original in-flight promise no longer
  // exists to receive it, which looked exactly like "the app just closes
  // and restarts to Welcome, sign-in never completes." createSessionFromUrl
  // silently no-ops for any URL that isn't actually an OAuth response, so
  // it's safe to run against every incoming deep link unconditionally.
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) createSessionFromUrl(url).catch((error) => console.warn('[auth] deep-link session recovery failed:', error));
    });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      createSessionFromUrl(url).catch((error) => console.warn('[auth] deep-link session recovery failed:', error));
    });
    return () => subscription.remove();
  }, []);

  return <AuthContext.Provider value={{ session, isLoading }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
