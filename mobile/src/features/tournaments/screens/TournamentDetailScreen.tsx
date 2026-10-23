import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { TextField } from '@/components/TextField';
import { colors, radii, spacing, themedStyles } from '@/constants/theme';
import { MOCK_TOURNAMENT_DETAILS } from '../mockDetailData';
import { useTournamentsFeed } from '../useRizzfit';
import {
  adaptRizzfitMatch,
  courtLabel,
  groupFixtureSummaries,
  groupTeamNames,
  useRizzfitLeaderboard,
  useRizzfitMatches,
  useRizzfitMatchGroups,
} from '../useRizzfitDetail';
import { formatRange, STATUS_LABEL, STATUS_TONE } from '../components/TournamentCard';
import { MatchList } from '../components/MatchList';
import { StandingsTable } from '../components/StandingsTable';
import { BracketView } from '../components/BracketView';
import { TournamentLeaderboardTable } from '../components/TournamentLeaderboardTable';

type DetailTab = 'FIXTURES' | 'BRACKET' | 'LEADERBOARD';
type MatchFilter = 'all' | 'live' | 'upcoming' | 'past';

const TABS: { key: DetailTab; label: string }[] = [
  { key: 'FIXTURES', label: 'Fixtures' },
  { key: 'BRACKET', label: 'Bracket' },
  { key: 'LEADERBOARD', label: 'Leaderboard' },
];

const MATCH_FILTERS: { key: MatchFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'live', label: 'Live' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
];

const RIZZFIT_PREFIX = 'rizzfit-';
const UNASSIGNED_COURT = '__unassigned__';

// Mirrors RizzFit's own tournament page: a header card, then
// Fixtures / Bracket (knockout visual) / Leaderboard — see
// tournament.rizzfitt.com/Logesh/dpl/dplpickleball/pickleball/matches.
//
// A `rizzfit-<id>` tournament (from the live feed, see useRizzfit.ts) wires
// Fixtures + Leaderboard to RizzFit's real match/leaderboard endpoints.
// Bracket stays unwired for real tournaments — RizzFit's knockout endpoint
// requires a category+subCategory pair, and there's no documented endpoint
// to discover those ahead of time (see the chat thread, not guessed here).
// A `mock-<id>` tournament (the pre-integration placeholder data, now only
// reachable as a fallback when RizzFit isn't configured) keeps using the
// original mock detail with groups/standings/bracket.
export function TournamentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<DetailTab>('FIXTURES');
  const [groupIndex, setGroupIndex] = useState(0);
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');
  const [playerSearch, setPlayerSearch] = useState('');

  const { data: feed } = useTournamentsFeed();
  const tournament = useMemo(() => feed?.tournaments.find((t) => t.id === id), [feed, id]);
  const isLive = !!id?.startsWith(RIZZFIT_PREFIX);
  const rizzfitId = isLive ? Number(id.slice(RIZZFIT_PREFIX.length)) : undefined;

  const mockDetail = !isLive && id ? MOCK_TOURNAMENT_DETAILS[id] : undefined;
  // Only fetch each tab's data while that tab is actually open — matches
  // and leaderboard were both firing (matches: up to 3 parallel RizzFit
  // calls, leaderboard: one call per category) on every mount regardless
  // of which tab was selected, which is exactly what made opening a
  // tournament feel laggy.
  const matchesQuery = useRizzfitMatches(rizzfitId, tab === 'FIXTURES');
  const leaderboardQuery = useRizzfitLeaderboard(rizzfitId, tab === 'LEADERBOARD');
  // match-groups has no required params (unlike knockout, which needs a
  // subCategory id we have no way to discover) — fetching it unscoped
  // returns every group across every category, which is exactly the real
  // data needed to finally confirm the undocumented teams/fixtures shape.
  const groupsQuery = useRizzfitMatchGroups(rizzfitId, tab === 'FIXTURES');

  const filteredMatches = useMemo(() => {
    const raw = matchesQuery.data ?? [];
    if (matchFilter === 'all') return raw;
    if (matchFilter === 'live') return raw.filter((m) => m.hasStarted && !m.hasEnded);
    if (matchFilter === 'upcoming') return raw.filter((m) => !m.hasStarted);
    return raw.filter((m) => m.hasEnded || m.isCompleted);
  }, [matchesQuery.data, matchFilter]);

  // Lets a member find their own upcoming matches without scrolling
  // through the whole list — matches by either player's name (a "team"
  // here is one singles player).
  const searchedMatches = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    if (!q) return filteredMatches;
    return filteredMatches.filter(
      (m) => (m.teamA?.name ?? '').toLowerCase().includes(q) || (m.teamB?.name ?? '').toLowerCase().includes(q)
    );
  }, [filteredMatches, playerSearch]);
  const displayMatches = useMemo(() => searchedMatches.map(adaptRizzfitMatch), [searchedMatches]);

  // Up to one match per court can be live at once (the club has 4 courts)
  // — showing them as a flat list buried which court each one is on, which
  // is the main thing someone watches a live match for. Grouped by court
  // only for the Live filter; other filters stay a flat list since court
  // matters less for upcoming/past matches.
  const liveByCourt = useMemo(() => {
    if (matchFilter !== 'live') return null;
    const groups = new Map<string, typeof searchedMatches>();
    for (const m of searchedMatches) {
      const key = m.courtName?.trim() || UNASSIGNED_COURT;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
  }, [searchedMatches, matchFilter]);

  if (!tournament || (!isLive && !mockDetail)) {
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

  const group = mockDetail?.groups[groupIndex];

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

        {tab === 'FIXTURES' && isLive && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupRow}>
              {MATCH_FILTERS.map((f) => (
                <Pressable
                  key={f.key}
                  style={[styles.groupChip, matchFilter === f.key && styles.groupChipActive]}
                  onPress={() => setMatchFilter(f.key)}
                >
                  <Text style={[styles.groupChipLabel, matchFilter === f.key && styles.groupChipLabelActive]}>{f.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextField
              placeholder="Search by player name"
              value={playerSearch}
              onChangeText={setPlayerSearch}
              autoCapitalize="none"
              style={styles.searchInput}
            />
            {matchesQuery.isLoading ? (
              <ActivityIndicator style={styles.loading} color={colors.primary} />
            ) : displayMatches.length === 0 ? (
              <EmptyState
                icon="tennisball-outline"
                mascot="napping"
                title="No matches here"
                message="Nothing in this filter right now — try a different one."
              />
            ) : liveByCourt ? (
              <View style={{ gap: spacing.md }}>
                {liveByCourt.map(([court, matches]) => (
                  <View key={court}>
                    <Text style={styles.sectionLabel}>
                      {court === UNASSIGNED_COURT ? 'Court not assigned' : courtLabel(court)}
                    </Text>
                    <MatchList matches={matches.map(adaptRizzfitMatch)} />
                  </View>
                ))}
              </View>
            ) : (
              <MatchList matches={displayMatches} />
            )}

            {(groupsQuery.data ?? []).length > 0 && (
              <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                <Text style={styles.sectionLabel}>Groups</Text>
                {(groupsQuery.data ?? []).map((g) => {
                  const teamNames = groupTeamNames(g);
                  const fixtures = groupFixtureSummaries(g);
                  return (
                    <View key={g.id} style={styles.groupCard}>
                      <Text style={styles.groupCardTitle}>{g.name}</Text>
                      {teamNames.length > 0 ? (
                        <Text style={styles.groupCardMeta}>{teamNames.join(' • ')}</Text>
                      ) : (
                        <Text style={styles.groupCardMeta}>{(g.teams ?? []).length} teams (names not confirmed yet)</Text>
                      )}
                      {fixtures.length > 0 && (
                        <Text style={styles.groupCardMeta}>
                          {fixtures.length} fixture{fixtures.length === 1 ? '' : 's'}: {fixtures.map((f) => f.label).join(', ')}
                        </Text>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}

        {tab === 'FIXTURES' && !isLive && mockDetail && group && (
          <>
            {mockDetail.groups.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.groupRow}>
                {mockDetail.groups.map((g, i) => (
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

        {tab === 'BRACKET' && isLive && (
          <EmptyState
            icon="trophy-outline"
            mascot="napping"
            title="Bracket not wired up yet"
            message="RizzFit's knockout endpoint needs a category selected first — this will be wired up once that's confirmed."
          />
        )}

        {tab === 'BRACKET' && !isLive && mockDetail && <BracketView rounds={mockDetail.bracket} />}

        {tab === 'LEADERBOARD' && isLive && (
          <>
            {leaderboardQuery.isLoading ? (
              <ActivityIndicator style={styles.loading} color={colors.primary} />
            ) : (leaderboardQuery.data ?? []).every((g) => g.rows.length === 0) ? (
              <EmptyState
                icon="list-outline"
                mascot="napping"
                title="No leaderboard yet"
                message="Standings will appear here once matches are completed."
              />
            ) : (
              <View style={{ gap: spacing.md }}>
                {(leaderboardQuery.data ?? [])
                  .filter((g) => g.rows.length > 0)
                  .map((g) => (
                    <View key={g.category}>
                      <Text style={styles.sectionLabel}>{g.category}</Text>
                      <TournamentLeaderboardTable rows={g.rows} />
                    </View>
                  ))}
              </View>
            )}
          </>
        )}

        {tab === 'LEADERBOARD' && !isLive && mockDetail && <TournamentLeaderboardTable rows={mockDetail.leaderboard} />}
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
  loading: { marginTop: spacing.xl },
  searchInput: { height: 40, fontSize: 13 },

  groupCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: 2,
  },
  groupCardTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  groupCardMeta: { fontSize: 11, color: colors.textMuted },
}));
