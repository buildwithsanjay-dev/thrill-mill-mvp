import { create } from 'zustand';

import type { LookupUserResult } from '@/features/team/api';

// Client-only draft state for the 3-step Create Team wizard (Team ->
// Members -> Membership). Nothing here is authoritative: the team isn't
// created until step 1's Continue, members aren't invited until step 2's
// Continue, and the membership request isn't submitted until step 3's
// Confirm — each step still calls its real RPC immediately rather than
// batching everything to the end (restructuring Add Members to defer real
// invites would be a much larger change). What DOES happen now, reversing
// an earlier version of this comment: a Team that never reaches Step 3's
// membership request does not survive — see CreateTeamStepScreen.tsx's
// handleBack (abandonTeamCreation) and, as the actual unconditional
// guarantee, fn_cleanup_abandoned_team_creations in supabase/migrations/
// 20260913150000_abandon_incomplete_team_creation.sql.
type WizardMember = LookupUserResult & { teamMemberId: string };

type CreateTeamWizardState = {
  teamName: string;
  teamId: string | null;
  teamJoinCode: string | null;
  selectedMembers: WizardMember[];
  planCode: string | null;
  setTeamName: (name: string) => void;
  setTeamId: (id: string | null) => void;
  setTeamJoinCode: (code: string | null) => void;
  addMember: (member: WizardMember) => void;
  removeMember: (userId: string) => void;
  setPlanCode: (code: string | null) => void;
  reset: () => void;
};

const initialState = {
  teamName: '',
  teamId: null,
  teamJoinCode: null,
  selectedMembers: [] as WizardMember[],
  planCode: null,
};

export const useCreateTeamWizard = create<CreateTeamWizardState>((set) => ({
  ...initialState,
  setTeamName: (name) => set({ teamName: name }),
  setTeamId: (id) => set({ teamId: id }),
  setTeamJoinCode: (code) => set({ teamJoinCode: code }),
  addMember: (member) =>
    set((state) =>
      state.selectedMembers.some((m) => m.id === member.id)
        ? state
        : { selectedMembers: [...state.selectedMembers, member] }
    ),
  removeMember: (userId) =>
    set((state) => ({ selectedMembers: state.selectedMembers.filter((m) => m.id !== userId) })),
  setPlanCode: (code) => set({ planCode: code }),
  reset: () => set({ ...initialState }),
}));
