import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Badge } from '@/components/Badge';
import { colors, radii, spacing, themedStyles } from '@/constants/theme';
import type { Tournament, TournamentStatus } from '../types';

const STATUS_LABEL: Record<TournamentStatus, string> = {
  ONGOING: 'ONGOING',
  UPCOMING: 'UPCOMING',
  COMPLETED: 'COMPLETED',
};

const STATUS_TONE: Record<TournamentStatus, 'active' | 'pending' | 'neutral'> = {
  ONGOING: 'active',
  UPCOMING: 'pending',
  COMPLETED: 'neutral',
};

const SPORT_ICON: Record<Tournament['sport'], keyof typeof Ionicons.glyphMap> = {
  Pickleball: 'tennisball-outline',
  'Turf/Football': 'football-outline',
  Cricket: 'baseball-outline',
};

function formatRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  return start === end ? fmt(start) : `${fmt(start)} - ${fmt(end)}`;
}

// Card layout follows the pattern seen on tournament.rizzfitt.com's own
// listing (organizer, host/venue, date range, status, sport+type) — see
// docs/phase2-tournament-memory-engine.md §6. Read-only shell: tapping it
// does nothing yet, there's no detail page until RizzFit's API exists.
export function TournamentCard({ tournament }: { tournament: Tournament }) {
  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.organizerRow}>
          <Ionicons name="shield-checkmark-outline" size={14} color={colors.primary} />
          <Text style={styles.organizer} numberOfLines={1}>
            {tournament.organizer}
          </Text>
        </View>
        <Badge label={STATUS_LABEL[tournament.status]} tone={STATUS_TONE[tournament.status]} />
      </View>

      <Text style={styles.name} numberOfLines={2}>
        {tournament.name}
      </Text>

      <View style={styles.metaRow}>
        <Ionicons name="location-outline" size={13} color={colors.textMuted} />
        <Text style={styles.metaText} numberOfLines={1}>
          {tournament.venueOrHost}
        </Text>
      </View>

      <View style={styles.bottomRow}>
        <Text style={styles.dateText}>{formatRange(tournament.startDate, tournament.endDate)}</Text>
        <View style={styles.sportChip}>
          <Ionicons name={SPORT_ICON[tournament.sport]} size={12} color={colors.textMuted} />
          <Text style={styles.sportChipText}>
            {tournament.sport} · {tournament.eventType}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  organizerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  organizer: { fontSize: 11, fontWeight: '700', color: colors.primary, flexShrink: 1 },
  name: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: spacing.sm, lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs },
  metaText: { fontSize: 12, color: colors.textMuted, flexShrink: 1 },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dateText: { fontSize: 12, fontWeight: '700', color: colors.text },
  sportChip: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sportChipText: { fontSize: 11, color: colors.textMuted },
}));
