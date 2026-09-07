import { create } from 'zustand';

// Client-only UI state: which Team the user is currently viewing/acting within.
// This is a convenience for navigation/UI only — it must NEVER be trusted as the
// source of a permission check. Every server call re-derives the caller's actual
// Team membership/role from their authenticated session, not from this store.
type TeamContextState = {
  activeTeamId: string | null;
  setActiveTeamId: (teamId: string | null) => void;
};

export const useTeamContextStore = create<TeamContextState>((set) => ({
  activeTeamId: null,
  setActiveTeamId: (teamId) => set({ activeTeamId: teamId }),
}));
