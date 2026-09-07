import { useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { getMyNotifications, markNotificationRead } from './api';

export function useMyNotifications() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['notifications', session?.user.id],
    queryFn: getMyNotifications,
    enabled: !!session?.user.id,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  return async (id: string) => {
    await markNotificationRead(id);
    queryClient.invalidateQueries({ queryKey: ['notifications', session?.user.id] });
  };
}
