import { supabase } from '@/lib/supabase';
import type { Booking, BookingParticipant, TurfResource, TurfSlot } from '@/types/db';

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
