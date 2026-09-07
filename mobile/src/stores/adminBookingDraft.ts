import { create } from 'zustand';

type AdminBookingDraftState = {
  teamId: string | null;
  teamName: string | null;
  teamJoinCode: string | null;
  walletCredits: number;
  setTeam: (team: { id: string; name: string; joinCode: string; walletCredits: number }) => void;
  reset: () => void;
};

export const useAdminBookingDraft = create<AdminBookingDraftState>((set) => ({
  teamId: null,
  teamName: null,
  teamJoinCode: null,
  walletCredits: 0,
  setTeam: (team) =>
    set({ teamId: team.id, teamName: team.name, teamJoinCode: team.joinCode, walletCredits: team.walletCredits }),
  reset: () => set({ teamId: null, teamName: null, teamJoinCode: null, walletCredits: 0 }),
}));
