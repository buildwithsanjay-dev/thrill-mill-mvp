import { supabase } from '@/lib/supabase';

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};

export async function getMyNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, read_at, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
