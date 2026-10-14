import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing, themedStyles } from '@/constants/theme';
import type { TournamentMatch } from '../types';

// Match-card shape follows RizzFit's own Fixtures list (team vs team, a
// round label like "Prelims") with the final score added once decided.
export function MatchList({ matches }: { matches: TournamentMatch[] }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {matches.map((m) => {
        const aWon = m.scoreA > m.scoreB;
        return (
          <View key={m.id} style={styles.card}>
            <View style={styles.teamRow}>
              <Text style={[styles.teamName, aWon && styles.winner]} numberOfLines={1}>
                {m.teamA}
              </Text>
              <Text style={styles.score}>{m.scoreA}</Text>
            </View>
            <View style={styles.teamRow}>
              <Text style={[styles.teamName, !aWon && styles.winner]} numberOfLines={1}>
                {m.teamB}
              </Text>
              <Text style={styles.score}>{m.scoreB}</Text>
            </View>
            <View style={styles.footer}>
              <Ionicons name="ellipse" size={6} color={colors.primary} />
              <Text style={styles.round}>{m.round}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = themedStyles(() => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
  },
  teamRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 2 },
  teamName: { fontSize: 13, color: colors.textMuted, flexShrink: 1, marginRight: spacing.sm },
  winner: { color: colors.text, fontWeight: '800' },
  score: { fontSize: 13, fontWeight: '800', color: colors.text, minWidth: 24, textAlign: 'right' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: spacing.xs },
  round: { fontSize: 11, color: colors.primary, fontWeight: '700' },
}));
