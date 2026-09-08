import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing } from '@/constants/theme';
import type { UpcomingTeamBooking } from '@/features/booking/api';
import { useUpcomingBookingsAcrossTeams } from '@/features/booking/useBooking';
import type { MyTeamSummary } from '@/features/team/api';
import { PendingInvites } from '@/features/team/components/PendingInvites';
import { useProfile } from '@/features/profile/useProfile';
import { useMyTeams } from '@/features/team/useTeams';
import { useWalletLedger } from '@/features/wallet/useWallet';
import { useActiveTeamStore } from '@/stores/activeTeam';
import { formatSlotTime, formatBookingDate } from '@/utils/datetime';

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

export function HomeScreen() {
  const { data: profile } = useProfile();
  const { data: teams, isPending } = useMyTeams();
  const { activeTeamId, setActiveTeamId } = useActiveTeamStore();
  const [switcherVisible, setSwitcherVisible] = useState(false);

  const activeTeam = useMemo(
    () => teams?.find((t) => t.team.id === activeTeamId) ?? teams?.[0],
    [teams, activeTeamId]
  );

  useEffect(() => {
    if (teams && teams.length > 0 && !activeTeamId) {
      setActiveTeamId(teams[0].team.id);
    }
  }, [teams, activeTeamId, setActiveTeamId]);

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
          <Text style={styles.greetingLabel}>{greeting().toUpperCase()},</Text>
          <Text style={styles.greetingName}>{profile?.full_name?.split(' ')[0] ?? 'there'} 👋</Text>
        </AppHeader>

        <PendingInvites />

        {!activeTeam ? (
          <NewMemberContent />
        ) : (
          <DashboardContent
            summary={activeTeam}
            hasMultipleTeams={(teams?.length ?? 0) > 1}
            onSwitchTeam={() => setSwitcherVisible(true)}
          />
        )}
      </ScrollView>

      <TeamSwitcherModal
        visible={switcherVisible}
        teams={teams ?? []}
        activeTeamId={activeTeam?.team.id}
        onSelect={(teamId) => {
          setActiveTeamId(teamId);
          setSwitcherVisible(false);
        }}
        onClose={() => setSwitcherVisible(false)}
      />
    </SafeAreaView>
  );
}

// In-place picker for the Home dashboard's team switcher — replaces the old
// behaviour of navigating to the full Teams list just to change context.
// Selecting a team only updates `activeTeamId` (client-only UI state) and
// stays on Home; every screen re-derives that Team's own server data once
// selected, so this never touches permission/financial state directly.
function TeamSwitcherModal({
  visible,
  teams,
  activeTeamId,
  onSelect,
  onClose,
}: {
  visible: boolean;
  teams: MyTeamSummary[];
  activeTeamId: string | undefined;
  onSelect: (teamId: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalSheet} onPress={() => {}}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Switch Network</Text>
          <ScrollView style={styles.modalList} bounces={false}>
            {teams.map(({ team }) => {
              const isActive = team.id === activeTeamId;
              return (
                <Pressable
                  key={team.id}
                  style={styles.modalRow}
                  onPress={() => onSelect(team.id)}
                >
                  <View style={styles.modalRowIcon}>
                    <Ionicons name="albums" size={16} color={colors.text} />
                  </View>
                  <Text style={styles.modalRowLabel} numberOfLines={1}>
                    {team.name}
                  </Text>
                  {isActive && <Ionicons name="checkmark-circle" size={20} color={colors.primary} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function NewMemberContent() {
  const router = useRouter();
  return (
    <View style={styles.newMemberWrap}>
      <Text style={styles.newMemberIntro}>Let&apos;s get you ready to play.</Text>
      <View style={styles.newMemberCard}>
        <Text style={styles.newMemberTitle}>Your Thrill Mill Club{'\n'}journey starts here.</Text>
        <Text style={styles.newMemberSubtitle}>Join the club, find your squad, and dominate the turf.</Text>
        <View style={{ height: spacing.lg }} />
        <Button
          title="Create a Network"
          iconRight="arrow-forward"
          onPress={() => router.push('/(app)/team/create')}
        />
        <View style={{ height: spacing.sm }} />
        <Button title="Join a Network" variant="outline" onPress={() => router.push('/(app)/team/join')} />
      </View>
    </View>
  );
}

function DashboardContent({
  summary,
  hasMultipleTeams,
  onSwitchTeam,
}: {
  summary: MyTeamSummary;
  hasMultipleTeams: boolean;
  onSwitchTeam: () => void;
}) {
  const router = useRouter();
  const { team, wallet, upcomingBooking } = summary;
  const { data: ledger } = useWalletLedger(team.id);
  const recentActivity = (ledger ?? []).slice(0, 3);

  return (
    <View>
      <OtherNetworksUpcoming />

      <Pressable
        style={styles.teamSwitcher}
        onPress={hasMultipleTeams ? onSwitchTeam : undefined}
        disabled={!hasMultipleTeams}
      >
        <Ionicons name="albums" size={16} color={colors.text} />
        <Text style={styles.teamSwitcherLabel}>{team.name}</Text>
        {hasMultipleTeams && <Ionicons name="chevron-down" size={16} color={colors.textMuted} />}
      </Pressable>

      <View style={styles.creditsCard}>
        <View style={styles.creditsCardTop}>
          <Text style={styles.creditsLabel}>NETWORK CREDITS</Text>
          <Badge label={team.name} tone="neutral" />
        </View>
        <Text style={styles.creditsValue}>{Math.round(wallet?.available_credits ?? 0).toLocaleString()}</Text>
        <View style={{ height: spacing.md }} />
        <Button
          title="Book Turf"
          iconLeft="football"
          onPress={() => router.push('/(app)/(tabs)/book')}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Upcoming</Text>
        {upcomingBooking && (
          <Pressable onPress={() => router.push(`/(app)/booking/${upcomingBooking.id}`)}>
            <Text style={styles.seeAll}>SEE ALL</Text>
          </Pressable>
        )}
      </View>

      {upcomingBooking ? (
        <Pressable
          style={styles.bookingCard}
          onPress={() => router.push(`/(app)/booking/${upcomingBooking.id}`)}
        >
          <Badge label="CONFIRMED" tone="active" />
          <Text style={styles.bookingTitle}>Turf Booking</Text>
          <Text style={styles.bookingMeta}>
            {formatBookingDate(upcomingBooking.booking_date)} • {formatSlotTime(upcomingBooking.start_time)}
            {' – '}
            {formatSlotTime(upcomingBooking.end_time)}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.noBookingCard}>
          <Text style={styles.noBookingText}>No upcoming games. Book a Turf to get started.</Text>
        </View>
      )}

      <View style={styles.quickGrid}>
        <QuickAction icon="add-circle" label="Book Turf" onPress={() => router.push('/(app)/(tabs)/book')} />
        <QuickAction icon="git-network" label="Team" onPress={() => router.push(`/(app)/team/${team.id}`)} />
        <QuickAction
          icon="time"
          label="Activity"
          onPress={() => router.push(`/(app)/wallet/${team.id}`)}
        />
        <QuickAction icon="stats-chart" label="Leaderboard" onPress={() => router.push('/(app)/(tabs)/leaderboard')} />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <Pressable onPress={() => router.push(`/(app)/wallet/${team.id}`)}>
          <Text style={styles.seeAll}>SEE ALL</Text>
        </Pressable>
      </View>
      {recentActivity.length === 0 ? (
        <Text style={styles.noBookingText}>No wallet activity yet.</Text>
      ) : (
        recentActivity.map((entry) => (
          <View key={entry.id} style={styles.activityRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.activityReason}>{entry.reason ?? entry.entry_type.replaceAll('_', ' ')}</Text>
              <Text style={styles.activityDate}>
                {new Date(entry.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </Text>
            </View>
            <Text style={[styles.activityAmount, { color: entry.amount >= 0 ? colors.primary : '#DC2626' }]}>
              {entry.amount >= 0 ? '+' : ''}
              {Math.round(entry.amount)}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.quickAction} onPress={onPress}>
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={16} color={colors.text} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

// Dashboard "Other Networks' Upcoming Events" strip — a horizontally
// scrollable row of every ACTIVE Team's upcoming CONFIRMED bookings (not
// just the currently selected Team), so a member can see what's coming up
// across every Network they're part of before picking one from the
// dropdown below.
function OtherNetworksUpcoming() {
  const router = useRouter();
  const { data: bookings, isPending } = useUpcomingBookingsAcrossTeams();

  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Other Networks&apos; Upcoming Events</Text>
      </View>

      {isPending ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />
      ) : !bookings || bookings.length === 0 ? (
        <View style={styles.noBookingCard}>
          <EmptyState
            icon="calendar-outline"
            title="No upcoming events"
            message="Nothing booked across your Networks yet."
          />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.upcomingStrip}
        >
          {bookings.map((b) => (
            <UpcomingEventCard key={b.id} booking={b} onPress={() => router.push(`/(app)/booking/${b.id}`)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function UpcomingEventCard({ booking, onPress }: { booking: UpcomingTeamBooking; onPress: () => void }) {
  return (
    <Pressable style={styles.upcomingCard} onPress={onPress}>
      <View style={styles.upcomingCardTeamRow}>
        <Ionicons name="shield" size={12} color="#A7F3D0" />
        <Text style={styles.upcomingCardTeam} numberOfLines={1}>
          {booking.team?.name ?? 'Network'}
        </Text>
      </View>
      <Text style={styles.upcomingCardTurf} numberOfLines={1}>
        {booking.turf?.name ?? 'Turf'}
      </Text>
      <Text style={styles.upcomingCardDate}>{formatBookingDate(booking.booking_date)}</Text>
      <Text style={styles.upcomingCardTime}>
        {formatSlotTime(booking.start_time)} – {formatSlotTime(booking.end_time)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  greetingLabel: { fontSize: 11, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.5 },
  greetingName: { fontSize: 18, fontWeight: '800', color: colors.text },

  newMemberWrap: { marginTop: spacing.sm },
  newMemberIntro: { fontSize: 15, color: colors.textMuted, marginBottom: spacing.lg },
  newMemberCard: {
    backgroundColor: '#0F1729',
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  newMemberTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', lineHeight: 28 },
  newMemberSubtitle: { fontSize: 13, color: '#94A3B8', marginTop: spacing.sm, lineHeight: 19 },

  teamSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  teamSwitcherLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text, marginLeft: spacing.xs },

  creditsCard: {
    backgroundColor: colors.primaryDark,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  creditsCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  creditsLabel: { fontSize: 11, fontWeight: '700', color: '#A7F3D0', letterSpacing: 0.5 },
  creditsValue: { fontSize: 34, fontWeight: '800', color: '#FFFFFF', marginTop: spacing.xs },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  seeAll: { fontSize: 12, fontWeight: '700', color: colors.primary },

  bookingCard: {
    backgroundColor: '#0F1729',
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  bookingTitle: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', marginTop: spacing.sm },
  bookingMeta: { fontSize: 13, color: '#94A3B8', marginTop: 4 },

  noBookingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
  },
  noBookingText: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },

  quickGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  quickAction: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  quickLabel: { fontSize: 10.5, fontWeight: '600', color: colors.text, textAlign: 'center' },

  upcomingStrip: { gap: spacing.sm, paddingRight: spacing.sm },
  upcomingCard: {
    width: 168,
    backgroundColor: '#0F1729',
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  upcomingCardTeamRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  upcomingCardTeam: { flex: 1, fontSize: 11, fontWeight: '700', color: '#A7F3D0', letterSpacing: 0.3 },
  upcomingCardTurf: { fontSize: 15, fontWeight: '800', color: '#FFFFFF', marginTop: spacing.sm },
  upcomingCardDate: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  upcomingCardTime: { fontSize: 12, color: '#94A3B8', marginTop: 2 },

  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activityReason: { fontSize: 13, fontWeight: '600', color: colors.text, textTransform: 'capitalize' },
  activityDate: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  activityAmount: { fontSize: 14, fontWeight: '800' },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 41, 0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '70%',
  },
  modalHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  modalList: { flexGrow: 0 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalRowLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
});
