import { Fragment, useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing, themedStyles } from '@/constants/theme';
import type { BracketRound } from '../types';

// Fixed box geometry so the connector-line math lines up exactly with what's
// rendered — sizing boxes from intrinsic text height would make the lines
// drift a few px on different devices/fonts.
const ROW_HEIGHT = 28;
const BOX_HEIGHT = ROW_HEIGHT * 2 + 1; // +1 for the divider between slots
const ROUND_0_GAP = spacing.md;
const ROUND_0_SLOT = BOX_HEIGHT + ROUND_0_GAP;
const COLUMN_WIDTH = 160;
const CONNECTOR_WIDTH = spacing.lg;

// Vertical center (px) of every match box in every round. Round 0 is spaced
// evenly; every later-round match sits exactly between the centers of the
// two matches that feed it — the standard bracket-tree layout — falling
// back to its single feeder's center when a round doesn't cleanly halve
// (a bye).
function computeCenters(rounds: BracketRound[]): number[][] {
  const centers: number[][] = [];
  rounds.forEach((round, i) => {
    if (i === 0) {
      centers.push(round.matches.map((_, j) => j * ROUND_0_SLOT + BOX_HEIGHT / 2));
      return;
    }
    const prev = centers[i - 1] ?? [];
    centers.push(
      round.matches.map((_, k) => {
        const a = prev[2 * k];
        const b = prev[2 * k + 1];
        if (a === undefined) return 0;
        return b === undefined ? a : (a + b) / 2;
      })
    );
  });
  return centers;
}

export function BracketView({ rounds }: { rounds: BracketRound[] }) {
  const isFinal = (name: string) => name.toLowerCase() === 'final';
  const centers = useMemo(() => computeCenters(rounds), [rounds]);
  const contentHeight = useMemo(() => {
    const round0 = centers[0] ?? [];
    if (round0.length === 0) return BOX_HEIGHT;
    return round0[round0.length - 1] + BOX_HEIGHT / 2;
  }, [centers]);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={styles.headerRow}>
          {rounds.map((round, i) => (
            <Fragment key={round.name}>
              <View style={[styles.columnHeader, { width: COLUMN_WIDTH }]}>
                {isFinal(round.name) && <Ionicons name="trophy" size={14} color={colors.accent} />}
                <Text style={[styles.columnTitle, isFinal(round.name) && styles.columnTitleFinal]}>
                  {round.name}
                </Text>
              </View>
              {i < rounds.length - 1 && <View style={{ width: CONNECTOR_WIDTH }} />}
            </Fragment>
          ))}
        </View>

        <View style={[styles.contentRow, { height: contentHeight }]}>
          {rounds.map((round, i) => (
            <Fragment key={round.name}>
              <View style={[styles.column, { width: COLUMN_WIDTH, height: contentHeight }]}>
                {round.matches.map((m, j) => (
                  <View key={m.id} style={[styles.matchBox, { top: centers[i][j] - BOX_HEIGHT / 2 }]}>
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

              {i < rounds.length - 1 && (
                <View style={[styles.connectorColumn, { width: CONNECTOR_WIDTH, height: contentHeight }]}>
                  {rounds[i + 1].matches.map((_, k) => {
                    const yA = centers[i][2 * k];
                    const yB = centers[i][2 * k + 1];
                    const yOut = centers[i + 1][k];
                    const midX = CONNECTOR_WIDTH / 2;

                    if (yB === undefined) {
                      // Bye — one feeder, straight line through.
                      return <View key={k} style={[styles.hLine, { top: yA - 1, left: 0, width: CONNECTOR_WIDTH }]} />;
                    }

                    const top = Math.min(yA, yB);
                    const height = Math.abs(yB - yA);
                    return (
                      <View key={k}>
                        <View style={[styles.hLine, { top: yA - 1, left: 0, width: midX }]} />
                        <View style={[styles.hLine, { top: yB - 1, left: 0, width: midX }]} />
                        <View style={[styles.vLine, { top, left: midX - 1, height }]} />
                        <View style={[styles.hLine, { top: yOut - 1, left: midX, width: midX }]} />
                      </View>
                    );
                  })}
                </View>
              )}
            </Fragment>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = themedStyles(() => ({
  headerRow: { flexDirection: 'row' },
  contentRow: { flexDirection: 'row' },
  column: { position: 'relative' },
  connectorColumn: { position: 'relative' },
  columnHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: spacing.xs },
  columnTitle: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.4, textTransform: 'uppercase' },
  columnTitleFinal: { color: colors.accent },
  matchBox: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  slot: { fontSize: 12, color: colors.textMuted, height: ROW_HEIGHT, lineHeight: ROW_HEIGHT, paddingHorizontal: spacing.sm },
  slotWinner: { color: colors.text, fontWeight: '800' },
  divider: { height: 1, backgroundColor: colors.border },
  hLine: { position: 'absolute', height: 2, backgroundColor: colors.border },
  vLine: { position: 'absolute', width: 2, backgroundColor: colors.border },
}));
