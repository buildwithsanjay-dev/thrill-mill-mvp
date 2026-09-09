import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing } from '@/constants/theme';
import { formatBookingDate, formatSlotTime } from '@/utils/datetime';
import type { MyTeamSummary } from '../api';
import { PendingInvites } from '../components/PendingInvites';
import { useMyTeams } from '../useTeams';
import { useActiveTeamStore } from '@/stores/activeTeam';

const ROLE_TONE = { HOST: 'host', CO_HOST: 'coHost', MEMBER: 'member' } as const;
const ROLE_LABEL = { HOST: 'HOST', CO_HOST: 'CO-HOST', MEMBER: 'MEMBER' } as const;
const HERO_COLORS = ['#0F1729', '#0C4A45', '#1E293B', '#4C1D24', '#1D3557'];

// Membership request status -> at-a-glance label for the Teams list, shown
// only while a Team's membership isn't ACTIVE yet (no badge once it is).
const MEMBERSHIP_STATUS_LABEL: Record<string, string> = {
  PLAN_SELECTED: 'PLAN SELECTED',
  REQUEST_SUBMITTED: 'REQUEST SUBMITTED',
  PAYMENT_PENDING: 'PAYMENT PENDING',
  ADMIN_REVIEW: 'UNDER ADMIN REVIEW',
  PAYMENT_VERIFIED: 'PAYMENT VERIFIED',
};

function heroColorFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return HERO_COLORS[Math.abs(hash) % HERO_COLORS.length];
}

export function MyTeamsScreen() {
  const router = useRouter();
  const { data: teams, isPending } = useMyTeams();
  const setActiveTeamId = useActiveTeamStore((s) => s.setActiveTeamId);

  const totalGames = 0; // no cross-team "active games" aggregate query yet — see TODO below

  if (isPending) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <AppHeader>
          <Text style={styles.title}>My Teams</Text>
          <Text style={styles.subtitle}>Your sports communities</Text>
        </AppHeader>

        <PendingInvites />

        {teams && teams.length > 0 && (
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{teams.length}</Text>
              <Text style={styles.statLabel}>TEAM{teams.length === 1 ? '' : 'S'}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.primary }]}>{totalGames}</Text>
              <Text style={styles.statLabel}>ACTIVE GAMES</Text>
            </View>
          </View>
        )}

        {!teams || teams.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No Teams yet"
            message="Create a Team to start booking Turfs with your squad."
          />
        ) : (
          teams.map((summary) => (
            <TeamCard
              key={summary.team.id}
              summary={summary}
              onPress={() => {
                setActiveTeamId(summary.team.id);
                router.push(`/(app)/team/${summary.team.id}`);
              }}
            />
          ))
        )}

        <Pressable style={styles.createButton} onPress={() => router.push('/(app)/team/create')}>
          <Ionicons name="add-circle-outline" size={18} color={colors.text} />
          <Text style={styles.createButtonLabel}>Create a new Team</Text>
        </Pressable>
        <Pressable style={styles.joinLink} onPress={() => router.push('/(app)/team/join')}>
          <Text style={styles.joinLinkLabel}>Have a code? Join a Team</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function TeamCard({ summary, onPress }: { summary: MyTeamSummary; onPress: () => void }) {
  const { team, myRole, wallet, memberCount, upcomingBooking, membershipStatus } = summary;
  const isMembershipActive = membershipStatus === 'ACTIVE';

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.cardHero, { backgroundColor: heroColorFor(team.id) }]}>
        {team.banner_url ? (
          <>
            <Image source={{ uri: team.banner_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
            {/* Scrim so the name/badge stay readable over an arbitrary photo —
                the solid-color fallback below doesn't need one, its own
                deliberately-dim icon already provides enough contrast. */}
            <View style={styles.cardHeroScrim} />
          </>
        ) : (
          <Ionicons name="football" size={64} color="rgba(255,255,255,0.15)" style={styles.cardHeroIcon} />
        )}
        <Text style={styles.cardHeroTitle}>{team.name}</Text>
        <View style={styles.cardHeroBadge}>
          <Badge label={ROLE_LABEL[myRole]} tone={ROLE_TONE[myRole]} />
        </View>
      </View>

      <View style={styles.cardBody}>
        {!isMembershipActive && (
          <View style={styles.membershipNotice}>
            <Ionicons name="alert-circle" size={14} color="#92400E" />
            <Text style={styles.membershipNoticeText}>
              {membershipStatus ? (MEMBERSHIP_STATUS_LABEL[membershipStatus] ?? membershipStatus) : 'No membership requested yet'}
            </Text>
          </View>
        )}

        <View style={styles.cardRow}>
          <View style={styles.cardCreditsRow}>
            <Ionicons name="card-outline" size={16} color={colors.primary} />
            <Text style={styles.cardCredits}>
              {Math.round(wallet?.available_credits ?? 0).toLocaleString()} TEAM CREDITS
            </Text>
          </View>
          <Text style={styles.cardMembers}>{memberCount} Active Member{memberCount === 1 ? '' : 's'}</Text>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.cardRow}>
          <View>
            <Text style={styles.cardMetaLabel}>Upcoming</Text>
            <Text style={styles.cardMetaValue}>
              {upcomingBooking
                ? `${formatBookingDate(upcomingBooking.booking_date)} • ${formatSlotTime(upcomingBooking.start_time)}`
                : 'No upcoming bookings'}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.cardMetaLabel}>Membership</Text>
            <Text style={[styles.cardMetaValue, isMembershipActive && styles.cardMetaValueActive]}>
              {isMembershipActive ? 'Active' : 'Not active'}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 13, color: colors.textMuted, marginTop: 2 },

  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 28, backgroundColor: colors.border },
  statValue: { fontSize: 20, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, marginTop: 2, letterSpacing: 0.4 },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    overflow: 'hidden',
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHero: { height: 120, justifyContent: 'flex-end', padding: spacing.md, overflow: 'hidden' },
  cardHeroIcon: { position: 'absolute', right: -8, bottom: -12 },
  cardHeroScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 41, 0.45)',
  },
  cardHeroTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  cardHeroBadge: { position: 'absolute', top: spacing.md, right: spacing.md },

  cardBody: { padding: spacing.md },
  membershipNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderRadius: radii.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  membershipNoticeText: { flex: 1, fontSize: 11, fontWeight: '700', color: '#92400E' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardCreditsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardCredits: { fontSize: 13, fontWeight: '700', color: colors.primary },
  cardMembers: { fontSize: 12, color: colors.textMuted },
  cardDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  cardMetaLabel: { fontSize: 10, color: colors.textMuted, fontWeight: '700', letterSpacing: 0.3 },
  cardMetaValue: { fontSize: 12, color: colors.text, marginTop: 2, fontWeight: '600' },
  cardMetaValueActive: { color: colors.primary },

  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.text,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  createButtonLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  joinLink: { alignItems: 'center', marginTop: spacing.md },
  joinLinkLabel: { fontSize: 13, fontWeight: '600', color: colors.primary },
});
