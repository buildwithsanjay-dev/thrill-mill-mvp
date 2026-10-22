import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AppHeader, ScreenIntro } from '@/components/AppHeader';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing, themedStyles } from '@/constants/theme';
import { useTournamentsFeed } from '../useRizzfit';
import { TournamentCard } from '../components/TournamentCard';
import type { Tournament } from '../types';

const EMPTY_TOURNAMENTS: Tournament[] = [];

type FilterTab = 'ONGOING' | 'UPCOMING' | 'COMPLETED' | 'REGISTERED';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'ONGOING', label: 'Ongoing' },
  { key: 'UPCOMING', label: 'Upcoming' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'REGISTERED', label: 'Registered' },
];

// Lists tournaments from RizzFit's real External Developer API
// (mobile/src/features/tournaments/useRizzfit.ts), grouped the way the
// owner specced it, falling back to preview (mock) data — with a small
// on-screen notice — whenever RizzFit isn't configured yet or the call
// fails. "Registered" can't actually match anything yet — it's wired for
// the day RizzFit's API lets us look up a registration by the signed-in
// user's phone number (see CLAUDE.md's Phase 2 note and
// docs/phase2-tournament-memory-engine.md §6) — until then it always shows
// the explanatory empty state below, honestly, rather than pretending to
// work.
export function TournamentsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<FilterTab>('UPCOMING');
  const { data, isLoading } = useTournamentsFeed();
  const tournaments = data?.tournaments ?? EMPTY_TOURNAMENTS;
  const isLive = data?.isLive ?? false;

  const rows = useMemo(() => {
    if (tab === 'REGISTERED') return tournaments.filter((t) => t.isRegistered);
    return tournaments.filter((t) => t.status === tab);
  }, [tab, tournaments]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenIntro>
          <Text style={styles.title}>Tournaments</Text>
          <Text style={styles.subtitle}>Hosted on RizzFit — discover, track, and see what you&apos;ve entered.</Text>
        </ScreenIntro>

        {!isLoading && !isLive && (
          <View style={styles.previewNotice}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={styles.previewNoticeText}>Showing preview data — RizzFit isn&apos;t connected yet.</Text>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabRow}>
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              style={[styles.tabChip, tab === t.key && styles.tabChipActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabChipLabel, tab === t.key && styles.tabChipLabelActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {isLoading ? (
          <ActivityIndicator style={styles.loading} color={colors.primary} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon="trophy-outline"
            mascot={tab === 'REGISTERED' ? 'face-thinking' : 'napping'}
            title={tab === 'REGISTERED' ? 'Registration lookup not connected yet' : 'Nothing here right now'}
            message={
              tab === 'REGISTERED'
                ? "Once RizzFit's API is connected, tournaments you&apos;ve registered for under your phone number will show up here."
                : `No ${tab.toLowerCase()} tournaments at the moment.`
            }
          />
        ) : (
          rows.map((t) => (
            <TournamentCard
              key={t.id}
              tournament={t}
              // Upcoming stays non-interactive — its detail is a different,
              // still-deferred registration-style page (pamphlet,
              // guidelines, categories+fees), not this Fixtures/Bracket/
              // Leaderboard shell.
              onPress={t.status !== 'UPCOMING' ? () => router.push(`/tournament/${t.id}`) : undefined}
            />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 4, lineHeight: 18 },

  previewNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.sm,
    backgroundColor: colors.surfaceAlt,
    alignSelf: 'flex-start',
  },
  previewNoticeText: { fontSize: 11, color: colors.textMuted },
  loading: { marginTop: spacing.xl },

  tabRow: { marginTop: spacing.lg, marginBottom: spacing.md, flexGrow: 0 },
  tabChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceAlt,
    marginRight: spacing.sm,
  },
  tabChipActive: { backgroundColor: colors.primary },
  tabChipLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  tabChipLabelActive: { color: '#FFFFFF' },
}));
