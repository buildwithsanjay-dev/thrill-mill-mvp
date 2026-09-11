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
