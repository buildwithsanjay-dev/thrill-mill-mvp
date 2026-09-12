import { supabase } from '@/lib/supabase';

// Matches whatever fn_send_push_notification's callers pass as p_data —
// currently either {team_id} (MEMBERSHIP_APPROVED) or {booking_id, team_id}
// / {booking_ids, team_id} (BOOKING_CONFIRMED single/multi-slot). See
// supabase/migrations/20260911180241_push_notifications.sql.
export type NotificationData = {
  booking_id?: string;
  booking_ids?: string[];
  team_id?: string;
} | null;

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: NotificationData;
  read_at: string | null;
  created_at: string;
};

export async function getMyNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, data, read_at, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

// Shared by both the in-app notification list (tapping a row) and the root
// layout's OS-push-tap listener, so tapping either the actual system
// notification or its in-app equivalent lands on the same screen. Routes
// purely by which data keys are present rather than by `type` — the raw OS
// push payload (unlike the notifications table row) never carries `type` at
// all (see fn_send_push_notification: `jsonb_build_object('to', ..., 'data',
// p_data)` — p_data only, type is a separate parameter used solely for the
// table insert), and the two current notification kinds are already
// unambiguous by shape alone: a membership approval never carries a booking
// id, a booking confirmation always does.
export function resolveNotificationRoute(data: NotificationData): string | null {
  const bookingId = data?.booking_id ?? data?.booking_ids?.[0];
  if (bookingId) return `/(app)/booking/${bookingId}`;
  if (data?.team_id) return `/(app)/team/${data.team_id}`;
  return null;
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
