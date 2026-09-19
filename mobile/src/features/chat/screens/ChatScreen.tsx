import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { showAlert } from '@/components/AppDialog';
import { Avatar } from '@/components/Avatar';
import { colors, radii, spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTeamDetails } from '@/features/team/useTeams';
import { friendlyError } from '@/lib/errors';
import type { ChatReactionEmoji } from '@/types/db';
import { createPoll, deleteMessage, markRoomRead, sendMessage, sendTextMessage, setReaction, votePoll } from '../api';
import { CreatePollSheet } from '../components/CreatePollSheet';
import { PollCard } from '../components/PollCard';
import {
  useChatRoom,
  useInvalidateChatQueries,
  useMessages,
  usePollResults,
  usePolls,
  usePresetCatalog,
  useReactions,
} from '../useChat';

const REACTION_EMOJIS: ChatReactionEmoji[] = ['👍', '❤️', '😂', '😮', '😢', '👏'];
const MAX_MESSAGE_LENGTH = 1000;

// Team chat: a normal typed chat, with the old preset messages kept as
// one-tap quick replies, and Host/Co-host polls posted into the same
// conversation. (Free text is a deliberate reversal of the original
// preset-only design — see 20260919120000_*.sql.)
export function ChatScreen() {
  const router = useRouter();
  const { id: teamId } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const { data: teamDetails } = useTeamDetails(teamId);
  const { data: room } = useChatRoom(teamId);
  const { data: messages, isPending: messagesPending } = useMessages(room?.id);
  const { data: presets } = usePresetCatalog();
  const invalidateChat = useInvalidateChatQueries();

  const [draft, setDraft] = useState('');
  const [reactingToMessageId, setReactingToMessageId] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [pollSheetOpen, setPollSheetOpen] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [votingOptionId, setVotingOptionId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const myId = session?.user.id;
  const myMembership = teamDetails?.members.find((m) => m.user_id === myId);
  const isHostOrCoHost = myMembership?.team_role === 'HOST' || myMembership?.team_role === 'CO_HOST';

  // Marks the dashboard's unread red dot as seen. Runs on mount, and again
  // whenever new messages come in while this screen is still open — so the
  // dot doesn't reappear the moment the user navigates away right after a
  // message arrived mid-session. Best-effort: a failure here shouldn't
  // block viewing the chat, so it's swallowed rather than surfaced.
  useEffect(() => {
    if (!room?.id || !myId) return;
    const roomId = room.id;
    const userId = myId;
    markRoomRead(roomId, userId)
      .then(() => invalidateChat({ readMarker: { roomId, userId } }))
      .catch(() => undefined);
    // invalidateChat is intentionally omitted: useInvalidateChatQueries
    // returns a new function identity every render, so including it would
    // refire this effect on every render instead of only when room/session/
    // messages actually change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, myId, messages]);

  // Keep the newest message in view.
  useEffect(() => {
    if ((messages ?? []).length > 0) {
      const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
      return () => clearTimeout(t);
    }
  }, [messages]);

  const messageIds = useMemo(() => (messages ?? []).map((m) => m.id), [messages]);
  const pollIds = useMemo(() => (messages ?? []).flatMap((m) => (m.poll_id ? [m.poll_id] : [])), [messages]);
  const { data: reactions } = useReactions(messageIds);
  const { data: polls } = usePolls(pollIds);
  const { data: pollResults } = usePollResults(pollIds);

  const reactionsByMessage = useMemo(() => {
    const map = new Map<string, Map<ChatReactionEmoji, number>>();
    for (const r of reactions ?? []) {
      const forMessage = map.get(r.message_id) ?? new Map<ChatReactionEmoji, number>();
      forMessage.set(r.emoji, (forMessage.get(r.emoji) ?? 0) + 1);
      map.set(r.message_id, forMessage);
    }
    return map;
  }, [reactions]);

  const handleSendText = async () => {
    const body = draft.trim();
    if (!body || !room || !myId || isSending) return;
    setIsSending(true);
    try {
      await sendTextMessage(room.id, myId, body);
      setDraft('');
      invalidateChat({ roomId: room.id });
    } catch (error) {
      showAlert('Message not sent', friendlyError(error));
    } finally {
      setIsSending(false);
    }
  };

  const handleSendPreset = async (presetKey: string) => {
    if (!room || !myId || isSending) return;
    setIsSending(true);
    try {
      await sendMessage(room.id, myId, presetKey);
      invalidateChat({ roomId: room.id });
    } catch (error) {
      showAlert('Message not sent', friendlyError(error));
    } finally {
      setIsSending(false);
    }
  };

  const handleReact = async (messageId: string, emoji: ChatReactionEmoji) => {
    if (!myId) return;
    setReactingToMessageId(null);
    try {
      await setReaction(messageId, myId, emoji);
      invalidateChat({ messageIds });
    } catch (error) {
      showAlert('Could not add reaction', friendlyError(error));
    }
  };

  const handleDelete = (messageId: string) => {
    showAlert(
      'Delete this message?',
      'It disappears for everyone in the team chat.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMessage(messageId);
              if (room) invalidateChat({ roomId: room.id });
            } catch (error) {
              showAlert('Could not delete the message', friendlyError(error));
            }
          },
        },
      ]
    );
  };

  const handlePostPoll = async (poll: { question: string; options: string[]; closesAt: string | null }) => {
    if (!room) return;
    setIsPosting(true);
    try {
      await createPoll({ roomId: room.id, ...poll });
      setPollSheetOpen(false);
      invalidateChat({ roomId: room.id, polls: true });
      showAlert('Poll posted', 'Your team can now vote in the chat.', undefined, { variant: 'success' });
    } catch (error) {
      showAlert('Could not post the poll', friendlyError(error));
    } finally {
      setIsPosting(false);
    }
  };

  const handleVote = async (pollId: string, optionId: string) => {
    setVotingOptionId(optionId);
    try {
      await votePoll(pollId, optionId);
      invalidateChat({ polls: true });
    } catch (error) {
      showAlert('Vote not recorded', friendlyError(error));
    } finally {
      setVotingOptionId(null);
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

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {messagesPending ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
        ) : (
          <ScrollView ref={scrollRef} contentContainerStyle={styles.feed} keyboardShouldPersistTaps="handled">
            {(messages ?? []).length === 0 && (
              <Text style={styles.emptyText}>
                No messages yet — say hello to your team{isHostOrCoHost ? ', or post a poll.' : '.'}
              </Text>
            )}
            {(messages ?? []).map((m) => {
              const isMine = m.sender_id === myId;
              const preset = (presets ?? []).find((p) => p.key === m.preset_key);
              const messageReactions = reactionsByMessage.get(m.id);
              const canDelete = isMine || isHostOrCoHost;
              const poll = m.poll_id ? polls?.find((p) => p.id === m.poll_id) : undefined;

              if (m.poll_id) {
                return (
                  <View key={m.id} style={styles.pollWrap}>
                    <Text style={styles.pollBy}>
                      {isMine ? 'You' : (m.sender?.full_name ?? 'Host')} posted a poll
                    </Text>
                    {poll ? (
                      <Pressable onLongPress={canDelete ? () => handleDelete(m.id) : undefined} delayLongPress={350}>
                        <PollCard
                          poll={poll}
                          results={(pollResults ?? []).filter((r) => r.poll_id === poll.id)}
                          votingOptionId={votingOptionId}
                          onVote={(optionId) => handleVote(poll.id, optionId)}
                        />
                      </Pressable>
                    ) : (
                      <ActivityIndicator color={colors.primary} />
                    )}
                  </View>
                );
              }

              return (
                <View key={m.id} style={[styles.messageRow, isMine && styles.messageRowMine]}>
                  {!isMine && <Avatar uri={m.sender?.avatar_url} name={m.sender?.full_name} size={28} />}
                  <View style={{ maxWidth: '78%' }}>
                    {!isMine && <Text style={styles.senderName}>{m.sender?.full_name ?? 'Member'}</Text>}
                    <Pressable
                      style={[styles.bubble, isMine && styles.bubbleMine]}
                      onPress={() => setReactingToMessageId(reactingToMessageId === m.id ? null : m.id)}
                      onLongPress={canDelete ? () => handleDelete(m.id) : undefined}
                      delayLongPress={350}
                    >
                      <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
                        {m.body ?? preset?.text ?? m.preset_key}
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

        <View style={styles.composerWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.chipRow}>
            {(presets ?? []).map((p) => (
              <Pressable key={p.key} style={styles.presetChip} disabled={isSending} onPress={() => handleSendPreset(p.key)}>
                <Text style={styles.presetChipText}>{p.text}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.composerRow}>
            {isHostOrCoHost && (
              <Pressable style={styles.pollButton} onPress={() => setPollSheetOpen(true)} hitSlop={6}>
                <Ionicons name="bar-chart" size={20} color={colors.primary} />
              </Pressable>
            )}
            <TextInput
              style={styles.input}
              placeholder="Message your team"
              placeholderTextColor={colors.textMuted}
              value={draft}
              onChangeText={setDraft}
              multiline
              maxLength={MAX_MESSAGE_LENGTH}
            />
            <Pressable
              style={[styles.sendButton, (!draft.trim() || isSending) && styles.sendButtonDisabled]}
              onPress={handleSendText}
              disabled={!draft.trim() || isSending}
            >
              {isSending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="send" size={18} color="#FFFFFF" />}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <CreatePollSheet
        visible={pollSheetOpen}
        isPosting={isPosting}
        onClose={() => setPollSheetOpen(false)}
        onPost={handlePostPoll}
      />
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
  bubbleText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  bubbleTextMine: { color: '#FFFFFF' },

  pollWrap: { width: '100%', gap: 4 },
  pollBy: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginLeft: 4 },

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

  composerWrap: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#FFFFFF',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  chipRow: { paddingHorizontal: spacing.lg, flexGrow: 0, marginBottom: spacing.sm },
  presetChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: radii.pill,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    marginRight: spacing.sm,
  },
  presetChipText: { fontSize: 12.5, fontWeight: '600', color: colors.text },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, paddingHorizontal: spacing.lg },
  pollButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E6F2EF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 21,
    paddingHorizontal: spacing.md,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    color: colors.text,
    backgroundColor: '#F8FAFC',
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.45 },
});
