import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing, themedStyles } from '@/constants/theme';
import type { ChatPoll, ChatPollResult } from '@/types/db';

function closesLabel(closesAt: string | null, now: number): string {
  if (!closesAt) return 'No deadline';
  const ms = new Date(closesAt).getTime() - now;
  if (ms <= 0) return 'Poll closed';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `Closes in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `Closes in ${hours} h`;
  return `Closes in ${Math.round(hours / 24)} days`;
}

// A poll posted in the team chat by a Host/Co-host. Single choice; tapping
// another option changes your vote until the poll closes. Everyone sees live
// counts; an Admin additionally sees who voted for what (the server only
// returns voter_names to an Admin, so this just renders what it is given).
export function PollCard({
  poll,
  results,
  onVote,
  votingOptionId,
}: {
  poll: ChatPoll;
  results: ChatPollResult[];
  onVote: (optionId: string) => void;
  votingOptionId: string | null;
}) {
  // Ticks so a poll flips to "closed" on screen without a refetch.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const isClosed = !!poll.closes_at && new Date(poll.closes_at).getTime() <= now;
  const total = results.reduce((sum, r) => sum + r.vote_count, 0);

  return (
    <View style={styles.card}>
      <View style={styles.tagRow}>
        <Ionicons name="bar-chart" size={13} color={colors.primary} />
        <Text style={styles.tag}>POLL</Text>
        <Text style={[styles.status, isClosed && { color: colors.danger }]}>{closesLabel(poll.closes_at, now)}</Text>
      </View>
      <Text style={styles.question}>{poll.question}</Text>

      {poll.options.map((option) => {
        const result = results.find((r) => r.option_id === option.id);
        const count = result?.vote_count ?? 0;
        const mine = result?.i_voted ?? false;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <View key={option.id} style={{ marginTop: spacing.sm }}>
            <Pressable
              disabled={isClosed || votingOptionId !== null}
              onPress={() => onVote(option.id)}
              style={[styles.option, mine && styles.optionMine]}
            >
              <View style={[styles.fill, { width: `${pct}%` }, mine && styles.fillMine]} />
              <View style={styles.optionRow}>
                <Ionicons
                  name={mine ? 'radio-button-on' : 'radio-button-off'}
                  size={18}
                  color={mine ? colors.primary : colors.textMuted}
                />
                <Text style={styles.optionLabel} numberOfLines={2}>
                  {option.label}
                </Text>
                <Text style={styles.count}>
                  {count} · {pct}%
                </Text>
              </View>
            </Pressable>
            {result?.voter_names && result.voter_names.length > 0 && (
              <Text style={styles.voters}>{result.voter_names.join(', ')}</Text>
            )}
          </View>
        );
      })}

      <Text style={styles.footer}>
        {total} {total === 1 ? 'vote' : 'votes'}
        {!isClosed ? ' · tap an option to vote or change your vote' : ''}
      </Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    width: '100%',
  },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tag: { fontSize: 10, fontWeight: '800', color: colors.primary, letterSpacing: 0.5 },
  status: { marginLeft: 'auto', fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  question: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceAlt,
  },
  optionMine: { borderColor: colors.primary },
  fill: { position: 'absolute', top: 0, bottom: 0, left: 0, backgroundColor: colors.border },
  fillMine: { backgroundColor: colors.primaryBorder },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 11, paddingHorizontal: spacing.md },
  optionLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  count: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  voters: { fontSize: 11, color: colors.textMuted, marginTop: 4, marginLeft: spacing.sm },
  footer: { marginTop: spacing.sm, fontSize: 11, color: colors.textMuted },
}));
