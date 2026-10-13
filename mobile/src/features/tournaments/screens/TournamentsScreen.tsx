import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader, ScreenIntro } from '@/components/AppHeader';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing, themedStyles } from '@/constants/theme';
import { MOCK_TOURNAMENTS } from '../mockData';
import { TournamentCard } from '../components/TournamentCard';

type FilterTab = 'ONGOING' | 'UPCOMING' | 'COMPLETED' | 'REGISTERED';

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'ONGOING', label: 'Ongoing' },
  { key: 'UPCOMING', label: 'Upcoming' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'REGISTERED', label: 'Registered' },
];

// Placeholder shell: lists real-shaped (but mock) RizzFit-style tournament
// data, grouped the way the owner specced it. "Registered" can't actually
// match anything yet — it's wired for the day RizzFit's API lets us look up
// a registration by the signed-in user's phone number (see CLAUDE.md's
// Phase 2 note and docs/phase2-tournament-memory-engine.md §6) — until
// then it always shows the explanatory empty state below, honestly, rather
// than pretending to work.
export function TournamentsScreen() {
  const [tab, setTab] = useState<FilterTab>('UPCOMING');

  const rows = useMemo(() => {
    if (tab === 'REGISTERED') return MOCK_TOURNAMENTS.filter((t) => t.isRegistered);
    return MOCK_TOURNAMENTS.filter((t) => t.status === tab);
  }, [tab]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenIntro>
          <Text style={styles.title}>Tournaments</Text>
          <Text style={styles.subtitle}>Hosted on RizzFit — discover, track, and see what you&apos;ve entered.</Text>
        </ScreenIntro>

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

        {rows.length === 0 ? (
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
          rows.map((t) => <TournamentCard key={t.id} tournament={t} />)
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
