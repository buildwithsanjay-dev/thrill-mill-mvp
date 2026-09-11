import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { colors, radii, spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTeamDetails } from '@/features/team/useTeams';
import type { ChatPresetCategory, ChatReactionEmoji } from '@/types/db';
import { markRoomRead, sendMessage, setReaction } from '../api';
import { useChatRoom, useInvalidateChatQueries, useMessages, usePresetCatalog, useReactions } from '../useChat';

const REACTION_EMOJIS: ChatReactionEmoji[] = ['👍', '❤️', '😂', '😮', '😢', '👏'];
const CATEGORY_LABELS: Record<ChatPresetCategory, string> = {
  ARRIVAL: 'Arrival',
  GAME: 'Game',
  LOGISTICS: 'Logistics',
  QUICK_REPLY: 'Quick reply',
};

export function ChatScreen() {
  const router = useRouter();
  const { id: teamId } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { data: teamDetails } = useTeamDetails(teamId);
  const { data: room } = useChatRoom(teamId);
  const { data: messages, isPending: messagesPending } = useMessages(room?.id);
  const { data: presets } = usePresetCatalog();
  const invalidateChat = useInvalidateChatQueries();

  const [reactingToMessageId, setReactingToMessageId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Marks the dashboard's unread red dot as seen. Runs on mount, and again
  // whenever new messages come in while this screen is still open — so the
  // dot doesn't reappear the moment the user navigates away right after a
  // message arrived mid-session. Best-effort: a failure here shouldn't
  // block viewing the chat, so it's swallowed rather than surfaced.
  useEffect(() => {
    if (!room?.id || !session?.user.id) return;
    const roomId = room.id;
    const userId = session.user.id;
    markRoomRead(roomId, userId)
      .then(() => invalidateChat({ readMarker: { roomId, userId } }))
      .catch(() => undefined);
    // invalidateChat is intentionally omitted: useInvalidateChatQueries
    // returns a new function identity every render (same as its sibling
    // useInvalidateBookingQueries), so including it here would refire
    // this effect on every render instead of only when room/session/
    // messages actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, session?.user.id, messages]);

  const messageIds = useMemo(() => (messages ?? []).map((m) => m.id), [messages]);
  const { data: reactions } = useReactions(messageIds);

  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, Map<ChatReactionEmoji, number>>();
    for (const r of reactions ?? []) {
      const forMessage = map.get(r.message_id) ?? new Map<ChatReactionEmoji, number>();
      forMessage.set(r.emoji, (forMessage.get(r.emoji) ?? 0) + 1);
      map.set(r.message_id, forMessage);
    }
    return map;
  }, [reactions]);

  const presetsByCategory = useMemo(() => {
    const map = new Map<ChatPresetCategory, typeof presets>();
    for (const p of presets ?? []) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list as NonNullable<typeof presets>);
    }
    return map;
  }, [presets]);

  const handleSend = async (presetKey: string) => {
    if (!room || !session?.user.id || isSending) return;
    setIsSending(true);
    try {
      await sendMessage(room.id, session.user.id, presetKey);
      invalidateChat({ roomId: room.id });
    } catch (error) {
      Alert.alert('Could not send', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleReact = async (messageId: string, emoji: ChatReactionEmoji) => {
    if (!session?.user.id) return;
    setReactingToMessageId(null);
    try {
      await setReaction(messageId, session.user.id, emoji);
      invalidateChat({ messageIds });
    } catch (error) {
      Alert.alert('Could not react', error instanceof Error ? error.message : 'Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{teamDetails?.team.name ?? 'Team Chat'}</Text>
          <Text style={styles.headerSubtitle}>Team Chat</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      {messagesPending ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.feed}>
          {(messages ?? []).length === 0 && (
            <Text style={styles.emptyText}>No messages yet — tap a preset below to say something.</Text>
          )}
          {(messages ?? []).map((m) => {
            const isMine = m.sender_id === session?.user.id;
            const preset = (presets ?? []).find((p) => p.key === m.preset_key);
            const messageReactions = reactionsByMessage.get(m.id);
            return (
              <View key={m.id} style={[styles.messageRow, isMine && styles.messageRowMine]}>
                {!isMine && <Avatar uri={m.sender?.avatar_url} name={m.sender?.full_name} size={28} />}
                <View style={{ maxWidth: '75%' }}>
                  {!isMine && <Text style={styles.senderName}>{m.sender?.full_name ?? 'Member'}</Text>}
                  <Pressable
                    style={[styles.bubble, isMine && styles.bubbleMine]}
                    onPress={() => setReactingToMessageId(reactingToMessageId === m.id ? null : m.id)}
                  >
                    <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
                      {preset?.text ?? m.preset_key}
                    </Text>
                  </Pressable>

                  {messageReactions && messageReactions.size > 0 && (
                    <View style={styles.reactionRow}>
                      {Array.from(messageReactions.entries()).map(([emoji, count]) => (
                        <View key={emoji} style={styles.reactionBadge}>
                          <Text style={styles.reactionBadgeText}>
                            {emoji} {count}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {reactingToMessageId === m.id && (
                    <View style={styles.emojiPicker}>
                      {REACTION_EMOJIS.map((emoji) => (
                        <Pressable key={emoji} onPress={() => handleReact(m.id, emoji)} hitSlop={6}>
                          <Text style={styles.emojiPickerEmoji}>{emoji}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.presetBar}>
        {(Object.keys(CATEGORY_LABELS) as ChatPresetCategory[]).map((category) => {
          const list = presetsByCategory.get(category);
          if (!list || list.length === 0) return null;
          return (
            <View key={category} style={{ marginBottom: spacing.sm }}>
              <Text style={styles.categoryLabel}>{CATEGORY_LABELS[category]}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {list.map((p) => (
                  <Pressable
                    key={p.key}
                    style={styles.presetChip}
                    disabled={isSending}
                    onPress={() => handleSend(p.key)}
                  >
                    <Text style={styles.presetChipText}>{p.text}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  headerSubtitle: { fontSize: 11, color: colors.textMuted, marginTop: 1 },

  feed: { padding: spacing.lg, gap: spacing.md },
  emptyText: { textAlign: 'center', color: colors.textMuted, fontSize: 13, marginTop: spacing.xl },

  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  messageRowMine: { justifyContent: 'flex-end', alignSelf: 'flex-end' },
  senderName: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginBottom: 2, marginLeft: 4 },

  bubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  bubbleMine: { backgroundColor: colors.primary, borderColor: colors.primary },
  bubbleText: { fontSize: 14, color: colors.text },
  bubbleTextMine: { color: '#FFFFFF' },

  reactionRow: { flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  reactionBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  reactionBadgeText: { fontSize: 11, color: colors.text },

  emojiPicker: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start',
  },
  emojiPickerEmoji: { fontSize: 20 },

  presetBar: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#FFFFFF',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  categoryLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3, marginBottom: 4 },
  presetChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: radii.pill,
    paddingVertical: 8,
    paddingHorizontal: spacing.md,
    marginRight: spacing.sm,
  },
  presetChipText: { fontSize: 13, fontWeight: '600', color: colors.text },
});
