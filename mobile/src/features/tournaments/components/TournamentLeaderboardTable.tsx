import { Text, View } from 'react-native';

import { colors, radii, spacing, themedStyles } from '@/constants/theme';
import type { LeaderboardRow } from '../types';

// Column shape matches RizzFit's own Past -> Leaderboard tab: # · TEAM/PLAYER
// · G · W · L · WIN%.
export function TournamentLeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <View style={styles.table}>
      <View style={[styles.row, styles.headerRow]}>
        <Text style={[styles.cell, styles.posCell, styles.headerText]}>#</Text>
        <Text style={[styles.cell, styles.teamCell, styles.headerText]}>TEAM</Text>
        <Text style={[styles.cell, styles.numCell, styles.headerText]}>G</Text>
        <Text style={[styles.cell, styles.numCell, styles.headerText]}>W</Text>
        <Text style={[styles.cell, styles.numCell, styles.headerText]}>L</Text>
        <Text style={[styles.cell, styles.pctCell, styles.headerText]}>WIN%</Text>
      </View>
      {rows.map((r, i) => (
        <View key={r.team} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
          <Text style={[styles.cell, styles.posCell, r.rank === 1 && styles.topRank]}>{r.rank}</Text>
          <Text style={[styles.cell, styles.teamCell, r.rank === 1 && styles.topRank]} numberOfLines={1}>
            {r.team}
          </Text>
          <Text style={[styles.cell, styles.numCell]}>{r.games}</Text>
          <Text style={[styles.cell, styles.numCell]}>{r.wins}</Text>
          <Text style={[styles.cell, styles.numCell]}>{r.losses}</Text>
          <Text style={[styles.cell, styles.pctCell]}>
            {r.games > 0 ? Math.round((r.wins / r.games) * 100) : 0}%
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = themedStyles(() => ({
  table: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  rowAlt: { backgroundColor: colors.surfaceAlt },
  headerRow: { borderBottomWidth: 1, borderBottomColor: colors.border },
  cell: { fontSize: 12, color: colors.text },
  headerText: { fontWeight: '800', color: colors.textMuted, fontSize: 10, letterSpacing: 0.4 },
  posCell: { width: 24 },
  teamCell: { flex: 1, fontWeight: '700' },
  numCell: { width: 28, textAlign: 'center' },
  pctCell: { width: 44, textAlign: 'right', fontWeight: '700' },
  topRank: { color: colors.accent, fontWeight: '800' },
}));
