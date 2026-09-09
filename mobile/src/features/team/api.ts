import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

import { supabase } from '@/lib/supabase';
import { localDateIso, localTimeHms } from '@/features/booking/api';
import type { MembershipRequestStatus, Team, TeamMember, TeamMembership, TeamRole, TeamWallet } from '@/types/db';

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user.id;
}

export type MyTeamSummary = {
  team: Team;
  myRole: TeamRole;
  wallet: TeamWallet | null;
  memberCount: number;
  upcomingBooking: {
    id: string;
    booking_date: string;
    start_time: string;
    end_time: string;
  } | null;
  // Latest membership request's status, so the Teams list can flag a Team
  // whose membership isn't ACTIVE yet (still under Admin review, payment
  // pending, etc.) — null means no membership has ever been requested.
  membershipStatus: MembershipRequestStatus | null;
  // Count of PENDING (awaiting Host/Co-host approval) join requests. RLS on
  // `team_members` only surfaces PENDING rows to that Team's Host/Co-host/
  // Admin, so this is naturally 0 for a plain member — no extra role check
  // needed client-side. Drives the "action needed" indicator on the
  // dashboard's team switcher; it disappears the moment the request is
  // actually accepted/rejected (the count drops to 0), rather than tracking
  // a separate "seen" flag.
  pendingRequestCount: number;
};

// "My Teams" (team page): every team I'm an ACTIVE member of, with the
// per-card summary data the list needs. Several round trips per team, but
// the expected fan-out (a member is rarely on more than a handful of
// Teams) makes this simpler and more obviously correct than one giant
// joined query, and every number here is server-fetched live, never cached
// client math.
export async function getMyTeams(): Promise<MyTeamSummary[]> {
  const userId = await requireUserId();

  const { data: memberships, error: memberError } = await supabase
    .from('team_members')
    .select('team_role, team:teams(id, name, status, created_by, join_code, created_at)')
    .eq('user_id', userId)
    .eq('status', 'ACTIVE');
  if (memberError) throw memberError;

  const rows = (memberships ?? []).filter((m) => m.team) as unknown as {
    team_role: TeamRole;
    team: Team;
  }[];

  // Local wall-clock "today"/"now", not `Date#toISOString()` (UTC calendar
  // date) — booking_date/start_time are the turf's local values, so mixing
  // in a UTC-derived date can push "today" a day off depending on the
  // device's UTC offset, silently hiding (or wrongly surfacing a stale)
  // upcoming booking. Same bug, same fix, as booking/api.ts's
  // getUpcomingBookingsAcrossTeams — see its comment for the full story.
  const now = new Date();
  const todayIso = localDateIso(now);
  const nowTime = localTimeHms(now);

  return Promise.all(
    rows.map(async ({ team_role, team }) => {
      // One Team's queries failing (a flaky request, a since-deleted Team
      // row, etc.) must never take the whole dashboard down with it — degrade
      // that single Team to nulled-out fields instead of propagating the
      // rejection through the outer Promise.all, per CLAUDE.md.
      try {
        const [{ data: wallet }, { count: memberCount }, { count: pendingRequestCount }, { data: upcoming }, { data: membership }] =
          await Promise.all([
            supabase.from('team_wallets').select('*').eq('team_id', team.id).maybeSingle(),
            supabase
              .from('team_members')
              .select('id', { count: 'exact', head: true })
              .eq('team_id', team.id)
              .eq('status', 'ACTIVE'),
            supabase
              .from('team_members')
              .select('id', { count: 'exact', head: true })
              .eq('team_id', team.id)
              .eq('status', 'PENDING'),
            supabase
              .from('bookings')
              .select('id, booking_date, start_time, end_time')
              .eq('team_id', team.id)
              .eq('status', 'CONFIRMED')
              // Future date, OR today but not yet ended — a plain
              // `.gte('booking_date', todayIso)` alone would keep showing a
              // same-day session as "upcoming" all day even after it ended.
              .or(`booking_date.gt.${todayIso},and(booking_date.eq.${todayIso},end_time.gt.${nowTime})`)
              .order('booking_date', { ascending: true })
              .order('start_time', { ascending: true })
              .limit(1)
              .maybeSingle(),
            supabase
              .from('team_memberships')
              .select('status')
              .eq('team_id', team.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle(),
          ]);

        return {
          team,
          myRole: team_role,
          wallet: (wallet as TeamWallet | null) ?? null,
          memberCount: memberCount ?? 0,
          pendingRequestCount: pendingRequestCount ?? 0,
          upcomingBooking: upcoming ?? null,
          membershipStatus: (membership?.status as MembershipRequestStatus | undefined) ?? null,
        };
      } catch (error) {
        console.error(`getMyTeams: failed to load per-team data for team ${team.id}`, error);
        return {
          team,
          myRole: team_role,
          wallet: null,
          memberCount: 0,
          pendingRequestCount: 0,
          upcomingBooking: null,
          membershipStatus: null,
        };
      }
    })
  );
}

export async function createTeam(name: string): Promise<string> {
  const { data, error } = await supabase.rpc('fn_create_team', { p_name: name });
  if (error) throw error;
  return data as string;
}

export async function getTeamJoinCode(teamId: string): Promise<string> {
  const { data, error } = await supabase.from('teams').select('join_code').eq('id', teamId).single();
  if (error) throw error;
  return data.join_code as string;
}

// Uploads to the (public, per migration) "team-banners" bucket at
// "<team_id>/banner.<ext>" and returns a cache-busted public URL — same
// pattern as profile/api.ts's uploadAvatar. Storage RLS on this bucket only
// allows the write if the caller is this Team's ACTIVE Host (or Admin) —
// fn_set_team_banner below independently re-checks the same rule server-side
// before touching teams.banner_url, so hiding the edit affordance
// client-side for a non-Host is a UX nicety, never the actual authorization.
export async function uploadTeamBanner(teamId: string, localUri: string): Promise<string> {
  const extMatch = /\.(\w+)$/.exec(localUri);
  const ext = (extMatch?.[1] ?? 'jpg').toLowerCase();
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
  const path = `${teamId}/banner.${ext}`;

  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const { error: uploadError } = await supabase.storage
    .from('team-banners')
    .upload(path, decode(base64), { contentType, upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('team-banners').getPublicUrl(path);
  return `${data.publicUrl}?t=${Date.now()}`;
}

export async function setTeamBanner(teamId: string, bannerUrl: string): Promise<void> {
  const { error } = await supabase.rpc('fn_set_team_banner', {
    p_team_id: teamId,
    p_banner_url: bannerUrl,
  });
  if (error) throw error;
}

type TeamRosterRow = {
  team_member_id: string;
  user_id: string;
  team_role: TeamRole;
  status: TeamMember['status'];
  joined_at: string | null;
  created_at: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
};

// Uses fn_get_team_roster rather than a plain table select: profiles_select
// RLS only allows seeing another member's profile once you're both ACTIVE
// on the Team, which would otherwise blank out invited/pending members'
// names on the Host's own Team Details screen. The RPC (Host/Co-host/Admin
// only for non-ACTIVE rows) closes that gap without weakening RLS itself.
export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const { data, error } = await supabase.rpc('fn_get_team_roster', { p_team_id: teamId });
  if (error) throw error;
  return ((data ?? []) as TeamRosterRow[]).map((row) => ({
    id: row.team_member_id,
    team_id: teamId,
    user_id: row.user_id,
    team_role: row.team_role,
    status: row.status,
    invited_by: null,
    joined_at: row.joined_at,
    created_at: row.created_at,
    profile: { full_name: row.full_name, avatar_url: row.avatar_url, phone: row.phone },
  }));
}

export type LookupUserResult = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
};

export async function lookupUserByPhone(phone: string): Promise<LookupUserResult | null> {
  const { data, error } = await supabase.rpc('fn_lookup_user_by_phone', { p_phone: phone });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ?? null;
}

// Broader "search as you type" by name OR phone — unlike
// lookupUserByPhone (exact match only), this returns up to 10 candidates.
export async function searchMembers(query: string): Promise<LookupUserResult[]> {
  const { data, error } = await supabase.rpc('fn_search_members', { p_query: query });
  if (error) throw error;
  return (data ?? []) as LookupUserResult[];
}

export async function inviteTeamMember(teamId: string, userId: string): Promise<string> {
  const { data, error } = await supabase.rpc('fn_invite_team_member', {
    p_team_id: teamId,
    p_user_id: userId,
  });
  if (error) throw error;
  return data as string;
}

export type MyInvite = { team_member_id: string; team_id: string; team_name: string; invited_at: string };

export async function getMyInvites(): Promise<MyInvite[]> {
  const { data, error } = await supabase.rpc('fn_get_my_invites');
  if (error) throw error;
  return (data ?? []) as MyInvite[];
}

export async function respondToInvite(teamMemberId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('fn_respond_to_team_invite', {
    p_team_member_id: teamMemberId,
    p_accept: accept,
  });
  if (error) throw error;
}

export async function assignCoHost(teamId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('fn_assign_co_host', { p_team_id: teamId, p_user_id: userId });
  if (error) throw error;
}

export async function removeTeamMember(teamMemberId: string): Promise<void> {
  const { error } = await supabase.rpc('fn_remove_team_member', { p_team_member_id: teamMemberId });
  if (error) throw error;
}

export async function leaveTeam(teamMemberId: string): Promise<void> {
  const { error } = await supabase.rpc('fn_leave_team', { p_team_member_id: teamMemberId });
  if (error) throw error;
}

export type JoinTeamResult = { team_member_id: string; team_id: string; team_name: string };

export async function requestJoinTeam(joinCode: string): Promise<JoinTeamResult> {
  const { data, error } = await supabase.rpc('fn_request_join_team', { p_join_code: joinCode });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as JoinTeamResult;
}

export async function respondToJoinRequest(teamMemberId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('fn_respond_to_join_request', {
    p_team_member_id: teamMemberId,
    p_accept: accept,
  });
  if (error) throw error;
}

export type TeamDetails = {
  team: Team;
  members: TeamMember[];
  wallet: TeamWallet | null;
  membership: TeamMembership | null;
};

export type TeamBookingCounts = { upcoming: number; played: number };

// Server-computed, not client-derived: buckets by session start time vs.
// public.now() (never device time), not by booking.status alone — nothing
// automatically flips a booking from CONFIRMED to COMPLETED once its start
// time passes (fn_complete_booking is a separate explicit action), so
// counting "Upcoming" purely off status would keep a played game counted
// as upcoming forever. One RPC, called by both the member Team Details
// screen and the Admin Team Details screen, so their numbers can never
// disagree.
export async function getTeamBookingCounts(teamId: string): Promise<TeamBookingCounts> {
  const { data, error } = await supabase.rpc('fn_get_team_booking_counts', { p_team_id: teamId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { upcoming: row?.upcoming_count ?? 0, played: row?.played_count ?? 0 };
}

export async function getTeamDetails(teamId: string): Promise<TeamDetails> {
  const [{ data: team, error: teamError }, members, { data: wallet }, { data: membership }] =
    await Promise.all([
      supabase.from('teams').select('*').eq('id', teamId).single(),
      getTeamMembers(teamId),
      supabase.from('team_wallets').select('*').eq('team_id', teamId).maybeSingle(),
      supabase
        .from('team_memberships')
        .select('*, plan:membership_plans(*)')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  if (teamError) throw teamError;

  return {
    team: team as Team,
    members,
    wallet: (wallet as TeamWallet | null) ?? null,
    membership: (membership as unknown as TeamMembership | null) ?? null,
  };
}
