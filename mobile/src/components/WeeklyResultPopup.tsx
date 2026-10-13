import { useEffect, useRef } from 'react';

import type { MascotPose } from '@/constants/mascotAssets';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMarkNotificationRead, useMyNotifications } from '@/features/notifications/useNotifications';
import { showAlert } from './AppDialog';

// Celebrates last week's leaderboard result with a full AppDialog pop-up
// (not just the usual bell row + push) the first time the app is opened
// after fn_send_weekly_leaderboard_results fires -- see
// supabase/migrations/20261013060000_weekly_leaderboard_result_notifications.sql.
// `read_at` doubles as "already shown", same as every other notification;
// marked read right after the dialog is queued so re-renders (or the next
// app open) never show the same result twice. `shownRef` only guards
// against this component firing the dialog twice for one row inside a
// single mount, between the mark-read request going out and its query
// invalidation coming back.
const MASCOT_BY_TYPE: Record<string, MascotPose> = {
  WEEKLY_LEADERBOARD_RANK1: 'trophy-champion',
  WEEKLY_LEADERBOARD_RANK2: 'throw-game-on',
  WEEKLY_LEADERBOARD_RANK3: 'wink-nice',
  WEEKLY_TEAM_LEAD: 'trophy-champion',
};

export function WeeklyResultPopup() {
  const { session } = useAuth();
  const { data: notifications } = useMyNotifications();
  const markRead = useMarkNotificationRead();
  const shownRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!session?.user.id || !notifications) return;
    const pending = notifications.find(
      (n) => !n.read_at && MASCOT_BY_TYPE[n.type] && !shownRef.current.has(n.id)
    );
    if (!pending) return;

    shownRef.current.add(pending.id);
    showAlert(pending.title, pending.body ?? undefined, undefined, {
      variant: 'success',
      mascot: MASCOT_BY_TYPE[pending.type],
    });
    markRead(pending.id);
  }, [notifications, session?.user.id, markRead]);

  return null;
}
