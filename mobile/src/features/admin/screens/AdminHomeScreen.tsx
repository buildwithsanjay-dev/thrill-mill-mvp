import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { colors, radii, spacing } from '@/constants/theme';
import { formatBookingDate, formatSlotTime } from '@/utils/datetime';
import { useAllBookings, useDashboardStats, usePendingActivationTeams, useRecentAuditLog } from '../useAdmin';

export function AdminHomeScreen() {
  const router = useRouter();
  const { data: stats, isPending: statsPending } = useDashboardStats();
  const { data: pendingTeams } = usePendingActivationTeams();
  const { data: bookings } = useAllBookings();
  const { data: auditLog } = useRecentAuditLog();

  const firstPending = pendingTeams?.[0];
  const upcomingBookings = (bookings ?? []).filter((b) => b.status === 'CONFIRMED').slice(0, 1);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <AppHeader>
          <Text style={styles.greetingLabel}>GOOD EVENING 👋</Text>
          <Text style={styles.greetingName}>Admin</Text>
        </AppHeader>
        <Text style={styles.tagline}>Here&apos;s what&apos;s happening today.</Text>

        {statsPending ? (
          <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} />
        ) : (
          <>
            <View style={styles.statsRow}>
              <StatCard
                icon="git-network"
                iconBg="#ECFDF5"
                label="ACTIVE"
                value={stats?.activeNetworks ?? 0}
                caption="Networks"
              />
              <StatCard
                icon="person-add"
                iconBg="#FFF1E6"
                label="ACTION REQ"
                value={stats?.pendingRequests ?? 0}
                caption="Pending Requests"
                labelColor="#C2410C"
              />
            </View>
            <View style={styles.wideStatCard}>
              <View style={styles.wideStatTop}>
                <View style={styles.wideStatIcon}>
                  <Ionicons name="calendar" size={18} color="#1D4ED8" />
                </View>
                <Badge label="UPCOMING" tone="neutral" />
              </View>
              <Text style={styles.wideStatValue}>{stats?.todaysBookings ?? 0}</Text>
              <Text style={styles.wideStatCaption}>Today&apos;s Bookings</Text>
            </View>
          </>
        )}

        {firstPending && (
          <>
            <View style={styles.sectionHeaderRow}>
              <Ionicons name="alert-circle" size={16} color="#C2410C" />
              <Text style={styles.sectionTitle}>Action Required</Text>
            </View>
            <Pressable
              style={styles.actionCard}
              onPress={() => router.push(`/(admin)/team/${firstPending.team.id}`)}
            >
              <Badge label="MEMBERSHIP REQUEST PENDING" tone="pending" />
              <Text style={styles.actionCardTitle}>{firstPending.team.name}</Text>
              <Text style={styles.actionCardMeta}>Network ID: {firstPending.team.join_code}</Text>
              <View style={styles.actionCardRow}>
                <View>
                  <Text style={styles.actionCardLabel}>PLAN</Text>
                  <Text style={styles.actionCardValue}>
                    ₹{firstPending.membership?.plan?.price_inr.toLocaleString()} ({firstPending.memberCount} Members)
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.actionCardLabel}>STATUS</Text>
                  <Text style={styles.actionCardValueMuted}>⏳ Awaiting Activation</Text>
                </View>
              </View>
              <View style={{ marginTop: spacing.md }}>
                <Button title="Review Network" iconRight="arrow-forward" onPress={() => router.push(`/(admin)/team/${firstPending.team.id}`)} />
              </View>
            </Pressable>
          </>
        )}

        <View style={styles.sectionHeaderRow2}>
          <Text style={styles.sectionTitle}>Upcoming Bookings</Text>
          <Pressable onPress={() => router.push('/(admin)/(tabs)/bookings')}>
            <Text style={styles.seeAll}>View All</Text>
          </Pressable>
        </View>
        {upcomingBookings.length === 0 ? (
          <Text style={styles.emptyText}>No upcoming bookings.</Text>
        ) : (
          upcomingBookings.map((b) => (
            <View key={b.id} style={styles.bookingCard}>
              <Badge label="CONFIRMED" tone="active" />
              <Text style={styles.bookingTitle}>{b.team?.name ?? 'Network'}</Text>
              <View style={styles.bookingMetaRow}>
                <Ionicons name="football-outline" size={13} color={colors.textMuted} />
                <Text style={styles.bookingMeta}>{b.turf?.name ?? 'Turf'}</Text>
              </View>
              <View style={styles.bookingBottomRow}>
                <Text style={styles.bookingMeta}>
                  {formatBookingDate(b.booking_date)} • {formatSlotTime(b.start_time)}–{formatSlotTime(b.end_time)}
                </Text>
                <Text style={styles.bookingMeta}>{b.participant_count} Participants</Text>
              </View>
            </View>
          ))
        )}

        <Text style={styles.sectionTitle2}>Quick Actions</Text>
        <View style={styles.quickGrid}>
          <QuickAction icon="git-network" label="Network Management" onPress={() => router.push('/(admin)/(tabs)/teams')} />
          <QuickAction
            icon="person-add"
            label="Membership Requests"
            badge={(stats?.pendingRequests ?? 0) > 0}
            onPress={() => router.push('/(admin)/(tabs)/teams')}
          />
          <QuickAction icon="calendar" label="Bookings Overview" onPress={() => router.push('/(admin)/(tabs)/bookings')} />
          <QuickAction icon="ban" label="Block Turf Slot" onPress={() => router.push('/(admin)/block-slot')} />
        </View>

        <Text style={styles.sectionTitle2}>Recent Activity</Text>
        <View style={styles.activityCard}>
          {(auditLog ?? []).length === 0 ? (
            <Text style={styles.emptyText}>No admin activity yet.</Text>
          ) : (
            auditLog!.map((log, index) => (
              <View key={log.id} style={styles.activityRow}>
                <View style={[styles.activityDot, index === 0 && styles.activityDotActive]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityAction}>{log.action.replaceAll('_', ' ')}</Text>
                  {!!log.reason && <Text style={styles.activityReason}>{log.reason}</Text>}
                </View>
                <Text style={styles.activityTime}>
                  {new Date(log.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({
  icon,
  iconBg,
  label,
  value,
  caption,
  labelColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  label: string;
  value: number;
  caption: string;
  labelColor?: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statTopRow}>
        <View style={[styles.statIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={16} color={colors.text} />
        </View>
        <Text style={[styles.statLabel, labelColor && { color: labelColor }]}>{label}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statCaption}>{caption}</Text>
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
  badge,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  badge?: boolean;
}) {
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      {badge && <View style={styles.quickBadge} />}
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  greetingLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.4 },
  greetingName: { fontSize: 18, fontWeight: '800', color: colors.text },
  tagline: { fontSize: 13, color: colors.textMuted, marginTop: -spacing.sm, marginBottom: spacing.md },

  statsRow: { flexDirection: 'row', gap: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  statIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 },
  statValue: { fontSize: 26, fontWeight: '800', color: colors.text },
  statCaption: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  wideStatCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  wideStatTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wideStatIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  wideStatValue: { fontSize: 26, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  wideStatCaption: { fontSize: 12, color: colors.textMuted },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionHeaderRow2: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  sectionTitle2: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },
  seeAll: { fontSize: 12, fontWeight: '700', color: colors.primary },

  actionCard: {
    backgroundColor: '#FFF7ED',
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderLeftWidth: 4,
    borderLeftColor: '#F97316',
  },
  actionCardTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  actionCardMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  actionCardRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  actionCardLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 },
  actionCardValue: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: 2 },
  actionCardValueMuted: { fontSize: 12, fontWeight: '700', color: '#C2410C', marginTop: 2 },

  emptyText: { fontSize: 13, color: colors.textMuted },

  bookingCard: { backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  bookingTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  bookingMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  bookingMeta: { fontSize: 12, color: colors.textMuted },
  bookingBottomRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },

  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  quickAction: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickBadge: { position: 'absolute', top: spacing.sm, right: spacing.sm, width: 8, height: 8, borderRadius: 4, backgroundColor: '#F97316' },
  quickIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  quickLabel: { fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' },

  activityCard: { backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  activityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md },
  activityDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border, marginTop: 5 },
  activityDotActive: { backgroundColor: colors.primary },
  activityAction: { fontSize: 13, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  activityReason: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  activityTime: { fontSize: 11, color: colors.textMuted },
});
