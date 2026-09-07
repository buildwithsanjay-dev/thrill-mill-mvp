import { create } from 'zustand';

import type { LookupUserResult } from '@/features/team/api';

type WizardMember = LookupUserResult & { teamMemberId: string; role: 'HOST' | 'CO_HOST' | 'MEMBER' };

// Draft state for the Admin's 5-step Create Network wizard (Details ->
// Members -> Roles -> Membership -> Review). Same philosophy as
// createTeamWizard.ts: each step commits to the backend immediately
// (fn_admin_create_team, fn_admin_add_team_member...), this store just
// tracks what's been done so far for the wizard UI.
type AdminTeamWizardState = {
  teamName: string;
  teamId: string | null;
  teamJoinCode: string | null;
  members: WizardMember[];
  planCode: string | null;
  setTeamName: (name: string) => void;
  setTeamId: (id: string | null) => void;
  setTeamJoinCode: (code: string | null) => void;
  addMember: (member: LookupUserResult & { teamMemberId: string }) => void;
  removeMemberId: (userId: string) => void;
  setMemberRole: (userId: string, role: 'HOST' | 'CO_HOST' | 'MEMBER') => void;
  setPlanCode: (code: string | null) => void;
  reset: () => void;
};

const initialState = {
  teamName: '',
  teamId: null,
  teamJoinCode: null,
  members: [] as WizardMember[],
  planCode: null,
};

export const useAdminTeamWizard = create<AdminTeamWizardState>((set) => ({
  ...initialState,
  setTeamName: (name) => set({ teamName: name }),
  setTeamId: (id) => set({ teamId: id }),
  setTeamJoinCode: (code) => set({ teamJoinCode: code }),
  addMember: (member) =>
    set((state) =>
      state.members.some((m) => m.id === member.id)
        ? state
        : { members: [...state.members, { ...member, role: 'MEMBER' }] }
    ),
  removeMemberId: (userId) => set((state) => ({ members: state.members.filter((m) => m.id !== userId) })),
  setMemberRole: (userId, role) =>
    set((state) => ({
      members: state.members.map((m) => {
        if (m.id === userId) return { ...m, role };
        // Only one Host / one Co-host — demote whoever else held it.
        if (role !== 'MEMBER' && m.role === role) return { ...m, role: 'MEMBER' };
        return m;
      }),
    })),
  setPlanCode: (code) => set({ planCode: code }),
  reset: () => set({ ...initialState, members: [] }),
}));
