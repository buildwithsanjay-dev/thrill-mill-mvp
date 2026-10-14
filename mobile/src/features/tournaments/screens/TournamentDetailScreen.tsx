import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing, themedStyles } from '@/constants/theme';
import { MOCK_TOURNAMENTS } from '../mockData';
import { MOCK_TOURNAMENT_DETAILS } from '../mockDetailData';
import { formatRange, STATUS_LABEL, STATUS_TONE } from '../components/TournamentCard';
import { MatchList } from '../components/MatchList';
import { StandingsTable } from '../components/StandingsTable';
import { BracketView } from '../components/BracketView';
import { TournamentLeaderboardTable } from '../components/TournamentLeaderboardTable';

type DetailTab = 'FIXTURES' | 'BRACKET' | 'LEADERBOARD';

const TABS: { key: DetailTab; label: string }[] = [
  { key: 'FIXTURES', label: 'Fixtures' },
  { key: 'BRACKET', label: 'Bracket' },
  { key: 'LEADERBOARD', label: 'Leaderboard' },
];

// Mirrors RizzFit's own completed-tournament page: a header card, then
// Fixtures (group tabs + match list + standings) / Bracket (knockout
// visual) / Leaderboard — see
// tournament.rizzfitt.com/Logesh/dpl/dplpickleball/pickleball/matches.
// Mock data only; a real RizzFit-backed version replaces MOCK_TOURNAMENT_
// DETAILS once their API/Swagger spec is available (CLAUDE.md Phase 2 note).
export function TournamentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<DetailTab>('FIXTURES');
  const [groupIndex, setGroupIndex] = useState(0);

  const tournament = useMemo(() => MOCK_TOURNAMENTS.find((t) => t.id === id), [id]);
  const detail = id ? MOCK_TOURNAMENT_DETAILS[id] : undefined;

  if (!tournament || !detail) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <Text style={styles.headerTitle}>Tournament</Text>
          <View style={{ width: 22 }} />
        </View>
        <EmptyState icon="trophy-outline" mascot="napping" title="Not available" message="This tournament's detail isn't ready yet." />
      </SafeAreaView>
    );
  }

  const group = detail.groups[groupIndex];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Tournament
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.infoCard}>
          <View style={styles.infoTopRow}>
            <Text style={styles.organizer} numberOfLines={1}>
              {tournament.organizer}
            </Text>
            <Badge label={STATUS_LABEL[tournament.status]} tone={STATUS_TONE[tournament.status]} />
          </View>
          <Text style={styles.name}>{tournament.name}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color={colors.textMuted} />
            <Text style={styles.metaText}>{tournament.venueOrHost}</Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={13} color={colors.textMuted} />
            <Text style={styles.metaText}>{formatRange(tournament.startDate, tournament.endDate)}</Text>
          </View>
        </View>

        <View style={styles.tabRow}>
          {TABS.map((t) => (
            <Pressable key={t.key} style={[styles.tabChip, tab === t.key && styles.tabChipActive]} onPress={() => setTab(t.key)}>
              <Text style={[styles.tabChipLabel, tab === t.key && styles.tabChipLabelActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'FIXTURES' && (
          <>
            {detail.groups.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupRow}>
                {detail.groups.map((g, i) => (
                  <Pressable
                    key={g.name}
                    style={[styles.groupChip, groupIndex === i && styles.groupChipActive]}
                    onPress={() => setGroupIndex(i)}
                  >
                    <Text style={[styles.groupChipLabel, groupIndex === i && styles.groupChipLabelActive]}>{g.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <MatchList matches={group.matches} />
            <Text style={styles.sectionLabel}>Standings</Text>
            <StandingsTable rows={group.standings} />
          </>
        )}

        {tab === 'BRACKET' && <BracketView rounds={detail.bracket} />}

        {tab === 'LEADERBOARD' && <TournamentLeaderboardTable rows={detail.leaderboard} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },

  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  infoTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  organizer: { fontSize: 11, fontWeight: '700', color: colors.primary, flexShrink: 1 },
  name: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: spacing.sm, lineHeight: 22 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  metaText: { fontSize: 12, color: colors.textMuted },

  tabRow: { flexDirection: 'row', gap: spacing.sm },
  tabChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.surfaceAlt },
  tabChipActive: { backgroundColor: colors.primary },
  tabChipLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  tabChipLabelActive: { color: '#FFFFFF' },

  groupRow: { flexGrow: 0, marginBottom: -spacing.xs },
  groupChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    marginRight: spacing.xs,
  },
  groupChipActive: { backgroundColor: colors.accent },
  groupChipLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  groupChipLabelActive: { color: '#FFFFFF' },

  sectionLabel: { fontSize: 12, fontWeight: '800', color: colors.textMuted, marginTop: spacing.xs },
}));
