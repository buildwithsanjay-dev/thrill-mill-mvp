import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { EmptyState } from '@/components/EmptyState';
import { SeasonHeroBand } from '@/components/season/SeasonHeroBand';
import { HALLOWEEN_DECOR } from '@/constants/seasonDecorAssets';
import { useSeason } from '@/components/SeasonProvider';
import { colors, radii, spacing, themedStyles } from '@/constants/theme';
import type { LeaderboardPeriod } from '../api';
import { useLeaderboard } from '../useLeaderboard';
import type { LiveLeaderboardRow } from '@/types/db';

type Scope = 'TEAM' | 'MEMBER';

// Index 0 = 1st place, 1 = 2nd, 2 = 3rd — gold/silver/bronze in that order.
// Was ['#D1D5DB', '#F59E0B', ...] (silver, gold, ...), which put silver on
// 1st place and gold on 2nd.
const PODIUM_COLORS = ['#F59E0B', '#D1D5DB', '#B45309'];

export function LeaderboardScreen() {
  const [scope, setScope] = useState<Scope>('TEAM');
  const [period, setPeriod] = useState<LeaderboardPeriod>('WEEK');
  // How many periods back from the current (possibly partial) one — 0 =
  // this week/month, 1 = last, 2 = the one before that, etc. Reset whenever
  // the Week/Month tab changes so a stale "3 months ago" doesn't silently
  // carry over into the Week view.
  const [offset, setOffset] = useState(0);
  const { season } = useSeason();
  const { data: rows, isPending } = useLeaderboard(scope, period, offset);

  const top3 = (rows ?? []).slice(0, 3);
  const rest = (rows ?? []).slice(3);
  const periodLabel = rows?.[0]
    ? `${formatShort(rows[0].period_start)} - ${formatShort(rows[0].period_end)}`
    : '';
  const unit = period === 'WEEK' ? 'WEEK' : 'MONTH';
  const periodChipLabel =
    offset === 0 ? `THIS ${unit}` : offset === 1 ? `LAST ${unit}` : `${offset} ${unit}S AGO`;

  const changePeriod = (next: LeaderboardPeriod) => {
    setPeriod(next);
    setOffset(0);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        <SeasonHeroBand>
          <View style={styles.titleRow}>
            <Text style={styles.subtitle}>Leaderboard</Text>
            {season === 'halloween' ? (
              <Image source={HALLOWEEN_DECOR.propPumpkinTrophy} style={{ width: 20, height: 20 }} contentFit="contain" />
            ) : (
              <Ionicons name="trophy" size={18} color={colors.warning} />
            )}
          </View>
          <Text style={styles.tagline}>Compete. Play. Climb.</Text>
        </SeasonHeroBand>

        <View style={styles.periodTabs}>
          <PeriodTab label="WEEK" active={period === 'WEEK'} onPress={() => changePeriod('WEEK')} />
          <PeriodTab label="MONTH" active={period === 'MONTH'} onPress={() => changePeriod('MONTH')} />
        </View>

        <View style={styles.periodNav}>
          <Pressable
            onPress={() => setOffset((o) => o + 1)}
            hitSlop={10}
            style={styles.periodNavArrow}
          >
            <Ionicons name="chevron-back" size={16} color={colors.primary} />
          </Pressable>
          <View style={styles.weekChip}>
            <Text style={styles.weekChipText}>{periodChipLabel}</Text>
            {!!periodLabel && <Text style={styles.weekChipDate}>· {periodLabel}</Text>}
          </View>
          <Pressable
            onPress={() => setOffset((o) => Math.max(0, o - 1))}
            hitSlop={10}
            disabled={offset === 0}
            style={[styles.periodNavArrow, offset === 0 && styles.periodNavArrowDisabled]}
          >
            <Ionicons name="chevron-forward" size={16} color={offset === 0 ? colors.textFaint : colors.primary} />
          </Pressable>
        </View>

        <View style={styles.scopeTabs}>
          <ScopeTab label="TEAMS" active={scope === 'TEAM'} onPress={() => setScope('TEAM')} />
          <ScopeTab label="MEMBERS" active={scope === 'MEMBER'} onPress={() => setScope('MEMBER')} />
        </View>

        {isPending ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
        ) : !rows || rows.length === 0 ? (
          <EmptyState
            icon="trophy-outline"
            mascot="napping"
            title="No games played"
            message={
              offset === 0
                ? `Rankings appear as soon as a game is played this ${period === 'WEEK' ? 'week' : 'month'}.`
                : `No completed games in that ${period === 'WEEK' ? 'week' : 'month'}.`
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
                {season === 'halloween' && (
                  <Image
                    source={HALLOWEEN_DECOR.shapeGraveyard}
                    style={styles.podiumGraveyard}
                    tintColor={colors.textFaint}
                  />
                )}
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
  const { season } = useSeason();
  const height = rank === 1 ? 88 : rank === 2 ? 64 : 52;
  const name = row.display_name ?? (scope === 'TEAM' ? 'Team' : 'Member');

  return (
    <View style={styles.podiumSlot}>
      {rank === 1 && season === 'halloween' && (
        <Image
          source={HALLOWEEN_DECOR.propWitchHat}
          style={{ width: 22, height: 22, marginBottom: -6, zIndex: 1 }}
          contentFit="contain"
        />
      )}
      {rank === 1 && season !== 'halloween' && (
        <Ionicons name="trophy" size={16} color={colors.warning} style={{ marginBottom: 4 }} />
      )}
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

const styles = themedStyles(() => ({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.lg },
  subtitle: { fontSize: 22, fontWeight: '800', color: colors.text },
  tagline: { fontSize: 13, color: colors.textMuted, marginTop: 2 },

  periodTabs: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radii.pill,
    padding: 4,
    marginTop: spacing.lg,
  },
  periodTab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radii.pill },
  periodTabActive: { backgroundColor: colors.primary },
  periodTabLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  periodTabLabelActive: { color: '#FFFFFF' },

  periodNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  periodNavArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodNavArrowDisabled: { backgroundColor: colors.surfaceAlt },
  weekChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  weekChipText: { fontSize: 11, fontWeight: '800', color: colors.primary },
  weekChipDate: { fontSize: 11, color: colors.textMuted, marginLeft: 4 },

  scopeTabs: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radii.pill, padding: 4, marginTop: spacing.md },
  scopeTab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radii.pill },
  scopeTabActive: { backgroundColor: colors.primary },
  scopeTabLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  scopeTabLabelActive: { color: '#FFFFFF' },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.xl, textAlign: 'center' },
  sectionSubtitle: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 2 },

  podiumRow: { position: 'relative', flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.xl, gap: spacing.sm },
  podiumGraveyard: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 24, opacity: 0.25 },
  podiumSlot: { flex: 1, alignItems: 'center' },
  podiumName: { fontSize: 12, fontWeight: '700', color: colors.text, marginTop: spacing.xs, maxWidth: 90 },
  podiumMeta: { fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm },
  podiumBlock: { width: '100%', borderTopLeftRadius: radii.sm, borderTopRightRadius: radii.sm, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 6 },
  podiumRank: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  listRank: { width: 28, fontSize: 13, fontWeight: '800', color: colors.textMuted },
  listIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  listName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  listValue: { fontSize: 14, fontWeight: '800', color: colors.primary },
}));
