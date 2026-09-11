import { supabase } from '@/lib/supabase';
import type { ChatMessage, ChatMessageReaction, ChatPreset, ChatReactionEmoji, ChatRoom } from '@/types/db';

// Fixed reference data (17 rows, never changes at runtime) — a plain
// select, not something worth a Realtime subscription or aggressive
// refetch policy. Cached long via the query hook's staleTime instead.
export async function getPresetCatalog(): Promise<ChatPreset[]> {
  const { data, error } = await supabase
    .from('chat_preset_catalog')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ChatPreset[];
}

export async function getChatRoom(teamId: string): Promise<ChatRoom> {
  const { data, error } = await supabase.from('chat_rooms').select('*').eq('team_id', teamId).single();
  if (error) throw error;
  return data as unknown as ChatRoom;
}

export async function getMessages(roomId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*, sender:profiles(full_name, avatar_url)')
    .eq('room_id', roomId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as ChatMessage[];
}

// Plain RLS-gated insert (no RPC) — the preset_key foreign key is the
// actual boundary against freeform/violating content, per
// docs/superpowers/specs/2026-09-11-team-chat-design.md. RLS already
// requires sender_id = auth.uid() and Team membership.
export async function sendMessage(roomId: string, senderId: string, presetKey: string): Promise<void> {
  const { error } = await supabase
    .from('chat_messages')
    .insert({ room_id: roomId, sender_id: senderId, preset_key: presetKey });
  if (error) throw error;
}

export async function getReactions(messageIds: string[]): Promise<ChatMessageReaction[]> {
  if (messageIds.length === 0) return [];
  const { data, error } = await supabase.from('chat_message_reactions').select('*').in('message_id', messageIds);
  if (error) throw error;
  return (data ?? []) as unknown as ChatMessageReaction[];
}

// Upsert: a second tap (even a different emoji) replaces the caller's
// prior reaction on this message, per the unique(message_id, user_id)
// constraint — matches WhatsApp/Slack-style single-reaction-per-person.
export async function setReaction(messageId: string, userId: string, emoji: ChatReactionEmoji): Promise<void> {
  const { error } = await supabase
    .from('chat_message_reactions')
    .upsert({ message_id: messageId, user_id: userId, emoji }, { onConflict: 'message_id,user_id' });
  if (error) throw error;
}

// Latest message's timestamp only (not the full message) — cheap enough
// to poll from the dashboard just to compare against last_read_at, unlike
// getMessages() which pulls every message + sender join.
export async function getLatestMessageAt(roomId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('created_at')
    .eq('room_id', roomId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.created_at ?? null;
}

export async function getLastReadAt(roomId: string, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('chat_room_reads')
    .select('last_read_at')
    .eq('room_id', roomId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.last_read_at ?? null;
}

// Called when the chat screen opens (and again whenever new messages
// arrive while it's open) — upsert, not insert, since a read marker for
// this room may already exist from a prior visit.
export async function markRoomRead(roomId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('chat_room_reads')
    .upsert({ room_id: roomId, user_id: userId, last_read_at: new Date().toISOString() }, { onConflict: 'room_id,user_id' });
  if (error) throw error;
}
