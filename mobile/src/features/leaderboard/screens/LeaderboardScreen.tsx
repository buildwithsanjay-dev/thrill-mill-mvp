import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing } from '@/constants/theme';
import type { LeaderboardPeriod } from '../api';
import { useLeaderboard } from '../useLeaderboard';
import type { LiveLeaderboardRow } from '@/types/db';

type Scope = 'TEAM' | 'MEMBER';

const PODIUM_COLORS = ['#D1D5DB', '#F59E0B', '#B45309'];

export function LeaderboardScreen() {
  const [scope, setScope] = useState<Scope>('TEAM');
  const [period, setPeriod] = useState<LeaderboardPeriod>('WEEK');
  const { data: rows, isPending } = useLeaderboard(scope, period);

  const top3 = (rows ?? []).slice(0, 3);
  const rest = (rows ?? []).slice(3);
  const periodLabel = rows?.[0]
    ? `${formatShort(rows[0].period_start)} - ${formatShort(rows[0].period_end)}`
    : '';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <AppHeader>
          <Text style={styles.title}>Thrill Mill Club</Text>
        </AppHeader>
        <View style={styles.titleRow}>
          <Text style={styles.subtitle}>Leaderboard</Text>
          <Ionicons name="trophy" size={18} color="#F59E0B" />
        </View>
        <Text style={styles.tagline}>Compete. Play. Climb.</Text>

        <View style={styles.periodTabs}>
          <PeriodTab label="THIS WEEK" active={period === 'WEEK'} onPress={() => setPeriod('WEEK')} />
          <PeriodTab label="THIS MONTH" active={period === 'MONTH'} onPress={() => setPeriod('MONTH')} />
        </View>

        {!!periodLabel && (
          <View style={styles.weekChip}>
            <Text style={styles.weekChipText}>{period === 'WEEK' ? 'THIS WEEK' : 'THIS MONTH'}</Text>
            <Text style={styles.weekChipDate}>· {periodLabel}</Text>
          </View>
        )}

        <View style={styles.scopeTabs}>
          <ScopeTab label="TEAMS" active={scope === 'TEAM'} onPress={() => setScope('TEAM')} />
          <ScopeTab label="MEMBERS" active={scope === 'MEMBER'} onPress={() => setScope('MEMBER')} />
        </View>

        {isPending ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
        ) : !rows || rows.length === 0 ? (
          <EmptyState
            icon="trophy-outline"
            title="No games played yet"
            message={
              period === 'WEEK'
                ? 'Rankings appear as soon as a game is played this week.'
                : 'Rankings appear as soon as a game is played this month.'
            }
          />
        ) : (
          <>
            <Text style={styles.sectionTitle}>
              {scope === 'TEAM' ? 'Top Teams' : 'Top Members'}
            </Text>
            <Text style={styles.sectionSubtitle}>
              Most active {period === 'WEEK' ? 'this week' : 'this month'}
            </Text>

            {top3.length > 0 && (
              <View style={styles.podiumRow}>
                {[1, 0, 2].map((podiumIndex) =>
                  top3[podiumIndex] ? (
                    <PodiumSlot key={podiumIndex} row={top3[podiumIndex]} rank={podiumIndex + 1} scope={scope} />
                  ) : (
                    <View key={podiumIndex} style={{ flex: 1 }} />
                  )
                )}
              </View>
            )}

            {rest.map((row) => (
              <View key={row.subject_id} style={styles.listRow}>
                <Text style={styles.listRank}>#{row.rank_no}</Text>
                {scope === 'MEMBER' ? (
                  <Avatar uri={row.avatar_url} name={row.display_name} size={32} />
                ) : (
                  <View style={styles.listIcon}>
                    <Ionicons name="shield" size={16} color={colors.textMuted} />
                  </View>
                )}
                <Text style={styles.listName} numberOfLines={1}>
                  {row.display_name ?? (scope === 'TEAM' ? 'Team' : 'Member')}
                </Text>
                <Text style={styles.listValue}>{Math.round(row.metric_value)}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ScopeTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.scopeTab, active && styles.scopeTabActive]} onPress={onPress}>
      <Text style={[styles.scopeTabLabel, active && styles.scopeTabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function PeriodTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable style={[styles.periodTab, active && styles.periodTabActive]} onPress={onPress}>
      <Text style={[styles.periodTabLabel, active && styles.periodTabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function PodiumSlot({ row, rank, scope }: { row: LiveLeaderboardRow; rank: number; scope: Scope }) {
  const height = rank === 1 ? 88 : rank === 2 ? 64 : 52;
  const name = row.display_name ?? (scope === 'TEAM' ? 'Team' : 'Member');

  return (
    <View style={styles.podiumSlot}>
      {rank === 1 && <Ionicons name="trophy" size={16} color="#F59E0B" style={{ marginBottom: 4 }} />}
      <Avatar uri={scope === 'MEMBER' ? row.avatar_url : undefined} name={name} size={rank === 1 ? 52 : 44} />
      <Text style={styles.podiumName} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.podiumMeta}>{Math.round(row.metric_value)}</Text>
      <View style={[styles.podiumBlock, { height, backgroundColor: PODIUM_COLORS[rank - 1] }]}>
        <Text style={styles.podiumRank}>{rank}</Text>
      </View>
    </View>
  );
}

function formatShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.lg },
  subtitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  tagline: { fontSize: 13, color: colors.textMuted, marginTop: 2 },

  periodTabs: {
    flexDirection: 'row',
    backgroundColor: '#EEF1F5',
    borderRadius: radii.pill,
    padding: 4,
    marginTop: spacing.lg,
  },
  periodTab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radii.pill },
  periodTabActive: { backgroundColor: '#0F1729' },
  periodTabLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  periodTabLabelActive: { color: '#FFFFFF' },

  weekChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginTop: spacing.md,
  },
  weekChipText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  weekChipDate: { fontSize: 11, color: colors.textMuted, marginLeft: 4 },

  scopeTabs: { flexDirection: 'row', backgroundColor: '#EEF1F5', borderRadius: radii.pill, padding: 4, marginTop: spacing.md },
  scopeTab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radii.pill },
  scopeTabActive: { backgroundColor: colors.primary },
  scopeTabLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  scopeTabLabelActive: { color: '#FFFFFF' },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.xl, textAlign: 'center' },
  sectionSubtitle: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 2 },

  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.xl, gap: spacing.sm },
  podiumSlot: { flex: 1, alignItems: 'center' },
  podiumName: { fontSize: 12, fontWeight: '700', color: colors.text, marginTop: spacing.xs, maxWidth: 90 },
  podiumMeta: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm },
  podiumBlock: { width: '100%', borderTopLeftRadius: radii.sm, borderTopRightRadius: radii.sm, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 6 },
  podiumRank: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listRank: { width: 28, fontSize: 13, fontWeight: '800', color: colors.textMuted },
  listIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  listName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  listValue: { fontSize: 14, fontWeight: '800', color: colors.primary },
});
