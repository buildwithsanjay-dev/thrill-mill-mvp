import { create } from 'zustand';

// Client-only UI state: which of the user's Teams is currently "selected"
// for the Home/Book tabs when they belong to more than one. Never used for
// permission/financial decisions — every screen re-fetches that Team's own
// data (wallet, membership, bookings) server-side once selected.
type ActiveTeamState = {
  activeTeamId: string | null;
  setActiveTeamId: (teamId: string | null) => void;
  reset: () => void;
};

export const useActiveTeamStore = create<ActiveTeamState>((set) => ({
  activeTeamId: null,
  setActiveTeamId: (teamId) => set({ activeTeamId: teamId }),
  reset: () => set({ activeTeamId: null }),
}));
