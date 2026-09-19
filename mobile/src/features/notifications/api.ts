import { supabase } from '@/lib/supabase';

// Matches whatever fn_send_push_notification's callers pass as p_data —
// currently either {team_id} (MEMBERSHIP_APPROVED) or {booking_id, team_id}
// / {booking_ids, team_id} (BOOKING_CONFIRMED single/multi-slot). See
// supabase/migrations/20260911180241_push_notifications.sql.
export type NotificationData = {
  booking_id?: string;
  booking_ids?: string[];
  team_id?: string;
  // 'ADMIN' = sent to a platform Admin, so a tap opens the Admin screens.
  audience?: 'ADMIN';
  // Added to the PUSH payload only: who the push was for, and its in-app row.
  recipient_id?: string;
  notification_id?: string;
  // 'home' = nothing to open beyond the dashboard (e.g. a team invite, where
  // the pending invite card lives, or a declined join request).
  open?: 'home';
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
  // The database lets an Admin READ every user's notifications (for support),
  // so "my notifications" must be asked for explicitly — without this filter an
  // Admin's bell listed every customer's invites and polls.
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, data, read_at, created_at')
    .eq('user_id', userId)
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
export function resolveNotificationRoute(data: NotificationData, isAdmin = false): string | null {
  // Never send an Admin to the customer home / customer team pages — those
  // treat the Admin as a brand-new member.
  if (data?.open === 'home') return isAdmin ? '/(admin)/(tabs)' : '/(app)/(tabs)';
  const bookingId = data?.booking_id ?? data?.booking_ids?.[0];
  if (bookingId) return `/(app)/booking/${bookingId}`;
  if (data?.team_id) {
    return isAdmin || data.audience === 'ADMIN' ? `/(admin)/team/${data.team_id}` : `/(app)/team/${data.team_id}`;
  }
  return null;
}

// Tap on a real OS push notification. Returns the screen to open, or null when
// the push should be ignored — e.g. it was addressed to a DIFFERENT account that
// used to be signed in on this phone. Also marks the matching in-app row read.
export async function handlePushTap(data: NotificationData): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user.id;
  if (!userId) return null;
  if (data?.recipient_id && data.recipient_id !== userId) return null;

  if (data?.notification_id) {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', data.notification_id)
      .eq('user_id', userId)
      .then(() => undefined, () => undefined);
  }
  const { data: profile } = await supabase.from('profiles').select('platform_role').eq('id', userId).maybeSingle();
  return resolveNotificationRoute(data, profile?.platform_role === 'ADMIN');
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
