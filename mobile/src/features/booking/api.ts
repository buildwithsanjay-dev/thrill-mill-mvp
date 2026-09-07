import { supabase } from '@/lib/supabase';
import type { Booking, BookingParticipant, TurfResource, TurfSlot } from '@/types/db';

// Local-time (not UTC) date/time-of-day formatting — display-only "is this
// upcoming" previews must stay internally consistent with each other and
// with how booking_date/start_time are populated (local wall-clock values).
// Never used for cancellation/refund eligibility — that's always decided by
// server time per CLAUDE.md.
function localDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localTimeHms(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export async function getDefaultTurf(): Promise<TurfResource> {
  const { data, error } = await supabase
    .from('turf_resources')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();
  if (error) throw error;
  return data as TurfResource;
}

export async function getTurfSlotsForDate(turfId: string, isoDate: string): Promise<TurfSlot[]> {
  const { data, error } = await supabase
    .from('turf_slots')
    .select('*')
    .eq('turf_id', turfId)
    .eq('slot_date', isoDate)
    .order('start_time', { ascending: true });
  if (error) throw error;
  return (data ?? []) as TurfSlot[];
}

export type SlotHold = { hold_id: string; expires_at: string };

// The 1-minute hold. The backend, not this client, decides validity and
// expiry — `expires_at` here is only for showing a countdown, never for
// deciding whether the hold is still good.
export async function createSlotHold(slotId: string, teamId: string): Promise<SlotHold> {
  const { data, error } = await supabase.rpc('fn_create_slot_hold', {
    p_slot_id: slotId,
    p_team_id: teamId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row as SlotHold;
}

// Server recomputes price, availability, and hold validity from scratch —
// any total shown to the user before this call is a preview only.
export async function confirmBooking(holdId: string, participantUserIds: string[]): Promise<string> {
  const { data, error } = await supabase.rpc('fn_confirm_booking', {
    p_hold_id: holdId,
    p_participant_user_ids: participantUserIds,
  });
  if (error) throw error;
  return data as string;
}

export type UpcomingTeamBooking = {
  id: string;
  team_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  team: { name: string } | null;
  turf: { name: string } | null;
};

// Upcoming CONFIRMED bookings across every Team the caller is an ACTIVE
// member of (not scoped to a single selected Team). No team_id filtering is
// done here — bookings_select RLS (fn_is_team_member(team_id) or
// fn_is_admin()) already limits rows to the caller's own Teams, so this is a
// plain RLS-scoped read, same pattern as getTeamBookings below.
//
// booking_date/start_time are separate columns (no combined timestamp on
// the table), so "starts at or after now" is approximated the same way
// team/api.ts's getMyTeams() does: filter server-side by date >= today, then
// trim sessions that already ended earlier today off the client result.
//
// IMPORTANT: `booking_date`/`start_time` are the turf's local wall-clock
// values, so "today" and "now" here must both come from the SAME local-time
// reference. A previous version paired `Date#toISOString()` (UTC calendar
// date) for `todayIso` with `Date#toTimeString()` (local time-of-day) for
// `nowTime` — an internally inconsistent "today" that, depending on the
// device's UTC offset, could push `todayIso` a day away from the device's
// actual local date. Since that mismatched date is also sent straight to
// `.gte('booking_date', ...)`, it could silently exclude every genuinely
// upcoming row from the query result itself (not just the client-side
// filter), which is exactly the "strip shows nothing" symptom even when
// other Teams have real upcoming CONFIRMED bookings. Both values below are
// derived from local date/time components only.
export async function getUpcomingBookingsAcrossTeams(limit = 15): Promise<UpcomingTeamBooking[]> {
  const now = new Date();
  const todayIso = localDateIso(now);
  const nowTime = localTimeHms(now); // "HH:MM:SS"

  const { data, error } = await supabase
    .from('bookings')
    .select('id, team_id, booking_date, start_time, end_time, team:teams(name), turf:turf_resources(name)')
    .eq('status', 'CONFIRMED')
    .gte('booking_date', todayIso)
    .order('booking_date', { ascending: true })
    .order('start_time', { ascending: true })
    .limit(limit);
  if (error) throw error;

  return ((data ?? []) as unknown as UpcomingTeamBooking[]).filter(
    (b) => b.booking_date !== todayIso || b.end_time > nowTime
  );
}

export async function getTeamBookings(teamId: string): Promise<Booking[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, turf:turf_resources(*)')
    .eq('team_id', teamId)
    .order('booking_date', { ascending: false })
    .order('start_time', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Booking[];
}

export async function getBooking(bookingId: string): Promise<Booking> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, turf:turf_resources(*)')
    .eq('id', bookingId)
    .single();
  if (error) throw error;
  return data as unknown as Booking;
}

export async function getBookingParticipants(bookingId: string): Promise<BookingParticipant[]> {
  const { data, error } = await supabase
    .from('booking_participants')
    .select('*, profile:profiles(full_name, avatar_url)')
    .eq('booking_id', bookingId)
    .neq('status', 'REMOVED')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as BookingParticipant[];
}

export async function modifyParticipants(
  bookingId: string,
  addUserIds: string[],
  removeUserIds: string[]
): Promise<void> {
  const { error } = await supabase.rpc('fn_modify_participants', {
    p_booking_id: bookingId,
    p_add_user_ids: addUserIds,
    p_remove_user_ids: removeUserIds,
  });
  if (error) throw error;
}

// Returns the business-outcome code from fn_cancel_booking (e.g.
// 'REFUNDED' / 'NO_REFUND') — server time, not device time, decided it.
export async function cancelBooking(bookingId: string, reason?: string): Promise<string> {
  const { data, error } = await supabase.rpc('fn_cancel_booking', {
    p_booking_id: bookingId,
    p_reason: reason ?? null,
  });
  if (error) throw error;
  return data as string;
}
