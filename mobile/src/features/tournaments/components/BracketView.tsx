import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing, themedStyles } from '@/constants/theme';
import type { BracketRound } from '../types';

// Columns-of-rounds layout matches RizzFit's own Knockout Bracket tab
// (Quarterfinal -> Semifinal -> 🏆 Final), just without the connector
// lines — those are a visual nicety RizzFit draws with real seed data;
// here the column order alone already reads as a bracket.
export function BracketView({ rounds }: { rounds: BracketRound[] }) {
  const isFinal = (name: string) => name.toLowerCase() === 'final';
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={styles.row}>
        {rounds.map((round) => (
          <View key={round.name} style={styles.column}>
            <View style={styles.columnHeader}>
              {isFinal(round.name) && <Ionicons name="trophy" size={14} color={colors.accent} />}
              <Text style={[styles.columnTitle, isFinal(round.name) && styles.columnTitleFinal]}>{round.name}</Text>
            </View>
            {round.matches.map((m) => (
              <View key={m.id} style={styles.matchBox}>
                <Text style={[styles.slot, m.winner === 'top' && styles.slotWinner]} numberOfLines={1}>
                  {m.top}
                </Text>
                <View style={styles.divider} />
                <Text style={[styles.slot, m.winner === 'bottom' && styles.slotWinner]} numberOfLines={1}>
                  {m.bottom}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  row: { flexDirection: 'row', gap: spacing.lg, paddingRight: spacing.lg },
  column: { width: 160, gap: spacing.md },
  columnHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.xs },
  columnTitle: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
  columnTitleFinal: { color: colors.accent },
  matchBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  slot: { fontSize: 12, color: colors.textMuted, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  slotWinner: { color: colors.text, fontWeight: '800' },
  divider: { height: 1, backgroundColor: colors.border },
}));
