import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { colors, radii, spacing } from '@/constants/theme';
import { useTeamBookings } from '@/features/booking/useBooking';
import { useTeamBookingCounts, useTeamDetails } from '@/features/team/useTeams';

const ROLE_TONE = { HOST: 'host', CO_HOST: 'coHost', MEMBER: 'member' } as const;

export function AdminTeamDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isPending } = useTeamDetails(id);
  const { data: bookings } = useTeamBookings(id);
  const { data: bookingCounts } = useTeamBookingCounts(id);

  if (isPending || !data) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const { team, members, wallet, membership } = data;
  const activeMembers = members.filter((m) => m.status === 'ACTIVE');
  const isPendingActivation = membership && membership.status !== 'ACTIVE';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Network Details</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.identityBlock}>
          <View style={styles.logoCircle}>
            <Ionicons name="shield" size={32} color={colors.textMuted} />
          </View>
          <Text style={styles.teamName}>{team.name}</Text>
          <Text style={styles.teamId}>{team.join_code}</Text>
          <Badge
            label={isPendingActivation ? 'PENDING ACTIVATION' : team.status}
            tone={isPendingActivation ? 'pending' : 'active'}
          />
          <Text style={styles.memberCount}>{activeMembers.length} Members</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>MEMBERSHIP</Text>
          {membership?.plan ? (
            <>
              <Text style={styles.cardTitle}>₹{membership.plan.price_inr.toLocaleString()} Membership</Text>
              {isPendingActivation ? (
                <Badge label="Awaiting Activation" tone="pending" />
              ) : (
                <Badge label="Active" tone="active" />
              )}
              <View style={styles.ruleBox}>
                <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
                <Text style={styles.ruleText}>
                  {membership.plan.discounted_hours_cap_per_24h
                    ? `First ${membership.plan.discounted_hours_cap_per_24h} playing hours within a rolling 24-hour period receive membership pricing. Additional hours use standard pricing.`
                    : 'No rolling 24-hour limit — every hour is charged at the membership rate.'}
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.cardMuted}>No membership plan selected yet.</Text>
          )}
        </View>

        {isPendingActivation && membership?.payment_id && (
          <Pressable
            style={styles.activateCard}
            onPress={() => router.push(`/(admin)/team/${team.id}/activate`)}
          >
            <View style={styles.activateIcon}>
              <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
            </View>
            <Text style={styles.activateTitle}>Membership Activation</Text>
            <Text style={styles.activateBody}>
              Review details and confirm activation after payment has been verified externally.
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <Button title="Activate Membership" iconRight="arrow-forward" onPress={() => router.push(`/(admin)/team/${team.id}/activate`)} />
            </View>
          </Pressable>
        )}

        <View style={styles.card}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.cardLabelDark}>{activeMembers.length} Members</Text>
          </View>
          {activeMembers.slice(0, 6).map((m) => (
            <View key={m.id} style={styles.memberRow}>
              <Avatar uri={m.profile?.avatar_url} name={m.profile?.full_name} size={32} />
              <Text style={styles.memberName}>{m.profile?.full_name ?? 'Member'}</Text>
              {m.team_role !== 'MEMBER' && (
                <Badge label={m.team_role === 'HOST' ? 'HOST' : 'CO-HOST'} tone={ROLE_TONE[m.team_role]} />
              )}
            </View>
          ))}
        </View>

        <View style={styles.walletCard}>
          <Text style={styles.walletLabel}>NETWORK WALLET</Text>
          <Text style={styles.walletValue}>₹{Math.round(wallet?.available_credits ?? 0).toLocaleString()} Credits</Text>
          <Text style={styles.walletCaption}>
            {isPendingActivation ? 'Membership not activated' : 'Shared network wallet'}
          </Text>
        </View>

        <View style={styles.statsRow}>
          <StatBox icon="people" value={activeMembers.length} label="MEMBERS" />
          <StatBox icon="football" value={bookingCounts?.played ?? 0} label="GAMES PLAYED" />
          <StatBox icon="calendar" value={bookingCounts?.upcoming ?? 0} label="UPCOMING" highlight />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>NETWORK INFO</Text>
          <InfoRow label="Network ID" value={team.join_code} />
          <InfoRow label="Created Date" value={new Date(team.created_at).toLocaleDateString('en-IN')} />
          <InfoRow label="Membership Plan" value={membership?.plan ? `₹${membership.plan.price_inr.toLocaleString()} Membership` : '—'} />
        </View>

        {(bookings ?? []).length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="calendar-outline" size={22} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>No bookings yet</Text>
            <Text style={styles.emptyBody}>Booking history will appear here once the network is active.</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function StatBox({
  icon,
  value,
  label,
  highlight,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.statBox}>
      <View style={[styles.statIcon, highlight && styles.statIconHighlight]}>
        <Ionicons name={icon} size={16} color={highlight ? colors.primary : colors.text} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },

  identityBlock: { alignItems: 'center', marginBottom: spacing.lg },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  teamName: { fontSize: 18, fontWeight: '800', color: colors.text },
  teamId: { fontSize: 12, color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },
  memberCount: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.4, marginBottom: spacing.sm },
  cardLabelDark: { fontSize: 15, fontWeight: '800', color: colors.text },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  cardMuted: { fontSize: 13, color: colors.textMuted },
  ruleBox: { flexDirection: 'row', gap: spacing.xs, backgroundColor: '#F8FAFC', borderRadius: radii.sm, padding: spacing.sm, marginTop: spacing.md },
  ruleText: { flex: 1, fontSize: 11, color: colors.textMuted, lineHeight: 16 },

  activateCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  activateIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  activateTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  activateBody: { fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 17 },

  sectionHeaderRow: { marginBottom: spacing.sm },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  memberName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },

  walletCard: { backgroundColor: '#0F1729', borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.md },
  walletLabel: { fontSize: 11, fontWeight: '700', color: '#5EEAD4', letterSpacing: 0.4 },
  walletValue: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginTop: 4 },
  walletCaption: { fontSize: 12, color: '#94A3B8', marginTop: 4 },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statIconHighlight: { backgroundColor: '#ECFDF5' },
  statValue: { fontSize: 16, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 9, fontWeight: '700', color: colors.textMuted, marginTop: 2, letterSpacing: 0.3 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  infoLabel: { fontSize: 12, color: colors.textMuted },
  infoValue: { fontSize: 12, fontWeight: '700', color: colors.text },

  emptyCard: { alignItems: 'center', padding: spacing.xl },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: spacing.sm },
  emptyBody: { fontSize: 12, color: colors.textMuted, marginTop: 4, textAlign: 'center' },
});
