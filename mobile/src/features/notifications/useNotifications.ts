import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { getMyNotifications, markNotificationRead } from './api';

export function useMyNotifications() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['notifications', session?.user.id],
    queryFn: getMyNotifications,
    enabled: !!session?.user.id,
    // A push can arrive while the app is open; poll lightly as a safety net
    // (the foreground listener in app/_layout.tsx refreshes it instantly).
    refetchInterval: 30_000,
  });
}

// Derived client-side from the already-fetched list rather than its own
// query — notifications.read_at is a per-row flag (unlike Team Chat's
// unread dot, which has to diff timestamps since chat has no such flag),
// and useMarkNotificationRead() already invalidates this same query key on
// read, so the dot clears immediately with no extra invalidation needed.
export function useHasUnreadNotifications(): boolean {
  const { data: notifications } = useMyNotifications();
  return !!notifications?.some((n) => !n.read_at);
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return async (id: string) => {
    await markNotificationRead(id);
    queryClient.invalidateQueries({ queryKey: ['notifications', session?.user.id] });
  };
}
