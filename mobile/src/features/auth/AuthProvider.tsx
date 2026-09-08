import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';

import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { useActiveTeamStore } from '@/stores/activeTeam';
import { useAdminBookingDraft } from '@/stores/adminBookingDraft';
import { useAdminTeamWizard } from '@/stores/adminTeamWizard';
import { useCreateTeamWizard } from '@/stores/createTeamWizard';

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
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      const newUserId = newSession?.user.id ?? null;
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

  return <AuthContext.Provider value={{ session, isLoading }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
