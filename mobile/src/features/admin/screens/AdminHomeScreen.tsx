import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { colors, radii, spacing } from '@/constants/theme';
import { formatBookingDate, formatSlotTime } from '@/utils/datetime';
import type { RevenueAnalytics } from '../api';
import {
  useAdminAuditLogFeed,
  useAdminRevenueAnalytics,
  useAllBookings,
  useDashboardStats,
  usePendingActivationTeams,
} from '../useAdmin';

type RangePreset = 'week' | 'month' | 'year';

const RANGE_PRESETS: { key: RangePreset; label: string; days: number }[] = [
  { key: 'week', label: 'Weekly', days: 7 },
  { key: 'month', label: 'Monthly', days: 30 },
  { key: 'year', label: 'Yearly', days: 365 },
];

function formatInr(value: number) {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

function formatCredits(value: number) {
  return Math.round(value).toLocaleString('en-IN');
}

export function AdminHomeScreen() {
  const router = useRouter();
  const [rangePreset, setRangePreset] = useState<RangePreset>('month');
  const { data: stats, isPending: statsPending } = useDashboardStats();
  const { data: pendingTeams } = usePendingActivationTeams();
  const { data: bookings } = useAllBookings();
  const { data: auditLog } = useAdminAuditLogFeed(6);
  const activeRangeDays = RANGE_PRESETS.find((p) => p.key === rangePreset)!.days;
  const { data: analytics, isPending: analyticsPending } = useAdminRevenueAnalytics(activeRangeDays);

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
                value={stats?.activeTeams ?? 0}
                caption="Teams"
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

        <View style={styles.sectionHeaderRow2}>
          <Text style={styles.sectionTitle2}>Revenue Analytics</Text>
          <View style={styles.rangeChipRow}>
            {RANGE_PRESETS.map((preset) => (
              <Pressable
                key={preset.key}
                style={[styles.rangeChip, rangePreset === preset.key && styles.rangeChipActive]}
                onPress={() => setRangePreset(preset.key)}
              >
                <Text style={[styles.rangeChipText, rangePreset === preset.key && styles.rangeChipTextActive]}>
                  {preset.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        {analyticsPending ? (
          <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} />
        ) : analytics ? (
          <RevenueAnalyticsSection analytics={analytics} rangeLabel={RANGE_PRESETS.find((p) => p.key === rangePreset)!.label} />
        ) : (
          <Text style={styles.emptyText}>Analytics unavailable right now.</Text>
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
              <Text style={styles.actionCardMeta}>Team ID: {firstPending.team.join_code}</Text>
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
                <Button title="Review Team" iconRight="arrow-forward" onPress={() => router.push(`/(admin)/team/${firstPending.team.id}`)} />
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
              <Text style={styles.bookingTitle}>{b.team?.name ?? 'Team'}</Text>
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
          <QuickAction icon="git-network" label="Team Management" onPress={() => router.push('/(admin)/(tabs)/teams')} />
          <QuickAction
            icon="person-add"
            label="Membership Requests"
            badge={(stats?.pendingRequests ?? 0) > 0}
            onPress={() => router.push('/(admin)/(tabs)/teams')}
          />
          <QuickAction icon="calendar" label="Bookings Overview" onPress={() => router.push('/(admin)/(tabs)/bookings')} />
          <QuickAction icon="ban" label="Block Turf Slot" onPress={() => router.push('/(admin)/block-slot')} />
        </View>

        <View style={styles.sectionHeaderRow2}>
          <Text style={styles.sectionTitle2}>Recent Activity</Text>
          <Pressable onPress={() => router.push('/(admin)/(tabs)/leaderboard')}>
            <Text style={styles.seeAll}>View All Logs</Text>
          </Pressable>
        </View>
        <View style={styles.activityCard}>
          {(auditLog ?? []).length === 0 ? (
            <Text style={styles.emptyText}>No admin activity yet.</Text>
          ) : (
            auditLog!.map((log, index) => (
              <View key={log.id} style={styles.activityRow}>
                <View style={[styles.activityDot, index === 0 && styles.activityDotActive]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.activityAction}>{log.action.replaceAll('_', ' ')}</Text>
                  <Text style={styles.activityActor}>
                    {log.admin_name}
                    {log.target_label ? ` → ${log.target_label}` : ''}
                  </Text>
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

function RevenueAnalyticsSection({ analytics, rangeLabel }: { analytics: RevenueAnalytics; rangeLabel: string }) {
  const { summary, daily } = analytics;
  const weekDelta = summary.bookings_this_week - summary.bookings_last_week;
  // reduce, not `Math.max(1, ...daily.map(...))` — a yearly window is 365
  // entries and spreading that many args into Math.max is needless risk for
  // no benefit over a plain reduce.
  const maxRevenue = daily.reduce((max, d) => Math.max(max, d.revenue_inr), 1);
  // Root cause of "the chart doesn't work": with 30 (or 365) days of bars in
  // a horizontal ScrollView, the view opens scrolled to the *start* — i.e.
  // the oldest day, which for a freshly-seeded/quiet period is a flat wall
  // of near-zero bars. The interesting, most recent data sits off-screen to
  // the right, so the chart reads as broken/empty until someone manually
  // scrolls all the way over. Auto-scroll to the latest day on load/refresh.
  const scrollRef = useRef<ScrollView>(null);
  const isDense = daily.length > 45; // yearly view — thinner bars, tighter gap

  return (
    <>
      <View style={styles.statsRow}>
        <View style={styles.revenueCard}>
          <View style={styles.revenueTopRow}>
            <View style={[styles.statIcon, { backgroundColor: '#ECFDF5' }]}>
              <Ionicons name="cash" size={16} color="#15803D" />
            </View>
            <Text style={styles.statLabel}>REVENUE</Text>
          </View>
          <Text style={styles.revenueValue}>{formatInr(summary.total_revenue_inr)}</Text>
          <Text style={styles.statCaption}>Collected all-time (₹, verified payments)</Text>
        </View>
        <View style={styles.revenueCard}>
          <View style={styles.revenueTopRow}>
            <View style={[styles.statIcon, { backgroundColor: '#EFF6FF' }]}>
              <Ionicons name="flash" size={16} color="#1D4ED8" />
            </View>
            <Text style={styles.statLabel}>CREDITS USED</Text>
          </View>
          <Text style={styles.revenueValue}>{formatCredits(summary.total_credits_consumed)}</Text>
          <Text style={styles.statCaption}>Consumed all-time via bookings</Text>
        </View>
      </View>
      <Text style={styles.analyticsNote}>
        Revenue is real money collected (₹). Credits consumed is a usage/volume figure — the two are not the
        same and should not be compared directly.
      </Text>

      <View style={styles.analyticsMetaRow}>
        <View style={styles.analyticsMetaCard}>
          <Text style={styles.analyticsMetaLabel}>ACTIVE MEMBERSHIPS</Text>
          <Text style={styles.analyticsMetaValue}>{summary.active_memberships}</Text>
        </View>
        <View style={styles.analyticsMetaCard}>
          <Text style={styles.analyticsMetaLabel}>BOOKINGS THIS WEEK</Text>
          <View style={styles.analyticsMetaValueRow}>
            <Text style={styles.analyticsMetaValue}>{summary.bookings_this_week}</Text>
            {weekDelta !== 0 && (
              <View style={styles.deltaChip}>
                <Ionicons
                  name={weekDelta > 0 ? 'arrow-up' : 'arrow-down'}
                  size={10}
                  color={weekDelta > 0 ? '#15803D' : colors.danger}
                />
                <Text style={[styles.deltaText, { color: weekDelta > 0 ? '#15803D' : colors.danger }]}>
                  {Math.abs(weekDelta)} vs last week
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={styles.trendCard}>
        <View style={styles.trendHeaderRow}>
          <Text style={styles.trendTitle}>Daily Revenue — {rangeLabel}</Text>
          <Text style={styles.trendCaption}>{formatInr(summary.period_revenue_inr)} total</Text>
        </View>
        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.trendBarsRow}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {daily.map((d) => {
            const barHeight = Math.max(3, Math.round((d.revenue_inr / maxRevenue) * 64));
            return (
              <View key={d.day} style={[styles.trendBarCol, isDense && styles.trendBarColDense]}>
                <View style={styles.trendBarTrack}>
                  <View style={[styles.trendBar, isDense && styles.trendBarDense, { height: barHeight }]} />
                </View>
                {!isDense && <Text style={styles.trendBarLabel}>{d.day.slice(8, 10)}</Text>}
              </View>
            );
          })}
        </ScrollView>
        {daily.length > 0 && (
          <Text style={styles.trendRangeCaption}>
            {formatDayLabelShort(daily[0].day)} – {formatDayLabelShort(daily[daily.length - 1].day)} · scroll to see earlier days
          </Text>
        )}
      </View>
    </>
  );
}

function formatDayLabelShort(isoDay: string) {
  const [, month, day] = isoDay.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${monthNames[Number(month) - 1]}`;
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

  revenueCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  revenueTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  revenueValue: { fontSize: 18, fontWeight: '800', color: colors.text },

  analyticsNote: { fontSize: 11, color: colors.textMuted, lineHeight: 16, marginTop: spacing.sm },

  analyticsMetaRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  analyticsMetaCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  analyticsMetaLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 },
  analyticsMetaValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },
  analyticsMetaValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  deltaChip: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  deltaText: { fontSize: 11, fontWeight: '700' },

  trendCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  trendHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  trendTitle: { fontSize: 12, fontWeight: '700', color: colors.text },
  trendCaption: { fontSize: 12, fontWeight: '700', color: colors.primary },
  trendBarsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingBottom: 4 },
  trendBarCol: { alignItems: 'center', width: 18 },
  trendBarColDense: { width: 5, gap: 0 },
  trendBarTrack: { height: 64, justifyContent: 'flex-end' },
  trendBar: { width: 10, borderRadius: 4, backgroundColor: colors.primary },
  trendBarDense: { width: 3, borderRadius: 2 },
  trendBarLabel: { fontSize: 8, color: colors.textMuted, marginTop: 4 },
  trendRangeCaption: { fontSize: 10, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },

  rangeChipRow: { flexDirection: 'row', gap: spacing.xs },
  rangeChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  rangeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  rangeChipText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  rangeChipTextActive: { color: colors.white },

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
  activityActor: { fontSize: 11, color: colors.primary, fontWeight: '600', marginTop: 1 },
  activityReason: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  activityTime: { fontSize: 11, color: colors.textMuted },
});
