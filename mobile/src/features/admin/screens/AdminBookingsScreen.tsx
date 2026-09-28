import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader, ScreenIntro } from '@/components/AppHeader';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { TextField } from '@/components/TextField';
import { colors, radii, spacing, themedStyles } from '@/constants/theme';
import { teamDetailsQueryKey } from '@/features/team/useTeams';
import { formatBookingDate, formatSlotTime, todayIso } from '@/utils/datetime';
import { adminCancelBooking, adminReviewBooking, type AdminBookingRow } from '../api';
import { useAllBookings, useInvalidateAdminQueries } from '../useAdmin';
import { showAlert } from '@/components/AppDialog';
import { friendlyError } from '@/lib/errors';

type Filter = 'ALL' | 'REVIEW' | 'TODAY' | 'UPCOMING' | 'COMPLETED';

const STATUS_TONE: Record<string, 'active' | 'danger' | 'pending' | 'neutral'> = {
  CONFIRMED: 'active',
  COMPLETED: 'neutral',
  CANCELLED: 'danger',
  EXPIRED: 'danger',
  FAILED: 'danger',
  HOLDING: 'pending',
  PENDING_REVIEW: 'pending',
  IN_PROGRESS: 'pending',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING_REVIEW: 'PENDING REVIEW',
};

export function AdminBookingsScreen() {
  const router = useRouter();
  const { data: bookings, isPending } = useAllBookings();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const queryClient = useQueryClient();
  const invalidateAdmin = useInvalidateAdminQueries();

  const invalidateForBooking = (booking: AdminBookingRow) => {
    invalidateAdmin();
    queryClient.invalidateQueries({ queryKey: ['team-bookings', booking.team_id] });
    queryClient.invalidateQueries({ queryKey: ['team-wallet', booking.team_id] });
    queryClient.invalidateQueries({ queryKey: teamDetailsQueryKey(booking.team_id) });
    queryClient.invalidateQueries({ queryKey: ['turf-slots', booking.turf_id] });
    queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
  };

  // Approve: cross-checked against TurfTown, becomes CONFIRMED, fires the
  // customer's "Booking Confirmed" push -- for real this time, not at the
  // moment of booking. A light confirm since it's the action that actually
  // moves money-adjacent state and sends a notification.
  const handleApprove = (booking: AdminBookingRow) => {
    showAlert(
      'Approve this booking?',
      `Confirms ${booking.team?.name ?? 'this Team'}'s slot and notifies them it's confirmed. Only do this after checking it against TurfTown.`,
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setReviewingId(booking.id);
            try {
              await adminReviewBooking(booking.id, true);
              invalidateForBooking(booking);
              showAlert('Booking approved', 'The Team has been notified their booking is confirmed.');
            } catch (error) {
              showAlert('Could not approve', friendlyError(error));
            } finally {
              setReviewingId(null);
            }
          },
        },
      ]
    );
  };

  // Decline: always a full refund (it was never actually confirmed), slot
  // reopens for anyone, Team is told why. Reason is optional but collected
  // inline (an AppDialog can't hold a text field) since it's what the Team
  // actually sees as the notification body.
  const handleConfirmDecline = async (booking: AdminBookingRow) => {
    setReviewingId(booking.id);
    try {
      await adminReviewBooking(booking.id, false, declineReason.trim() || undefined);
      invalidateForBooking(booking);
      setDecliningId(null);
      setDeclineReason('');
      showAlert('Booking declined', 'Full credits were refunded to the Team wallet and the slot reopened.');
    } catch (error) {
      showAlert('Could not decline', friendlyError(error));
    } finally {
      setReviewingId(null);
    }
  };

  const handleCancel = (booking: AdminBookingRow) => {
    showAlert(
      'Cancel this booking?',
      `${booking.team?.name ?? 'This Team'}'s booking on ${formatBookingDate(booking.booking_date)} at ${formatSlotTime(
        booking.start_time
      )} will be cancelled. Full refund if cancelled 24 hours or more before the slot; no refund inside 24 hours — decided by server time, not this device.`,
      [
        { text: 'Keep booking', style: 'cancel' },
        {
          text: 'Cancel booking',
          style: 'destructive',
          onPress: async () => {
            setCancellingId(booking.id);
            try {
              const outcome = await adminCancelBooking(booking.id, 'Cancelled by Admin');
              invalidateForBooking(booking);
              showAlert(
                'Booking cancelled',
                outcome === 'CANCELLED_REFUNDED'
                  ? 'Full credits were refunded to the Team wallet.'
                  : 'No refund — cancelled within 24 hours of the slot.'
              );
            } catch (error) {
              showAlert('Could not cancel', friendlyError(error));
            } finally {
              setCancellingId(null);
            }
          },
        },
      ]
    );
  };

  const today = todayIso();
  const counts = useMemo(() => {
    const rows = bookings ?? [];
    return {
      review: rows.filter((b) => b.status === 'PENDING_REVIEW').length,
      today: rows.filter((b) => b.booking_date === today).length,
      upcoming: rows.filter((b) => b.booking_date > today && b.status === 'CONFIRMED').length,
      completed: rows.filter((b) => b.status === 'COMPLETED').length,
    };
  }, [bookings, today]);

  const filtered = useMemo(() => {
    let rows = bookings ?? [];
    if (filter === 'REVIEW') rows = rows.filter((b) => b.status === 'PENDING_REVIEW');
    if (filter === 'TODAY') rows = rows.filter((b) => b.booking_date === today);
    if (filter === 'UPCOMING') rows = rows.filter((b) => b.booking_date > today && b.status === 'CONFIRMED');
    if (filter === 'COMPLETED') rows = rows.filter((b) => b.status === 'COMPLETED');
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter((b) => b.team?.name?.toLowerCase().includes(q) || b.id.toLowerCase().includes(q));
    }
    return rows;
  }, [bookings, filter, query, today]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        <ScreenIntro>
          <Text style={styles.title}>Bookings</Text>
        </ScreenIntro>

        <View style={styles.statsRow}>
          <Pressable
            style={[
              styles.statChip,
              counts.review > 0 && styles.statChipAttention,
              filter === 'REVIEW' && styles.statChipActive,
            ]}
            onPress={() => setFilter('REVIEW')}
          >
            <Text style={[styles.statChipLabel, filter === 'REVIEW' && styles.statChipLabelActive]}>REVIEW</Text>
            <Text style={[styles.statChipValue, filter === 'REVIEW' && styles.statChipLabelActive]}>{counts.review}</Text>
          </Pressable>
          <Pressable style={[styles.statChip, filter === 'TODAY' && styles.statChipActive]} onPress={() => setFilter('TODAY')}>
            <Text style={[styles.statChipLabel, filter === 'TODAY' && styles.statChipLabelActive]}>TODAY</Text>
            <Text style={[styles.statChipValue, filter === 'TODAY' && styles.statChipLabelActive]}>{counts.today}</Text>
          </Pressable>
          <Pressable style={[styles.statChip, filter === 'UPCOMING' && styles.statChipActive]} onPress={() => setFilter('UPCOMING')}>
            <Text style={[styles.statChipLabel, filter === 'UPCOMING' && styles.statChipLabelActive]}>UPCOMING</Text>
            <Text style={[styles.statChipValue, filter === 'UPCOMING' && styles.statChipLabelActive]}>{counts.upcoming}</Text>
          </Pressable>
          <Pressable style={[styles.statChip, filter === 'COMPLETED' && styles.statChipActive]} onPress={() => setFilter('COMPLETED')}>
            <Text style={[styles.statChipLabel, filter === 'COMPLETED' && styles.statChipLabelActive]}>COMPLETED</Text>
            <Text style={[styles.statChipValue, filter === 'COMPLETED' && styles.statChipLabelActive]}>{counts.completed}</Text>
          </Pressable>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Team or Booking ID"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {(['ALL', 'REVIEW', 'TODAY', 'UPCOMING', 'COMPLETED'] as Filter[]).map((f) => (
            <Pressable key={f} style={[styles.filterChip, filter === f && styles.filterChipActive]} onPress={() => setFilter(f)}>
              <Text style={[styles.filterChipLabel, filter === f && styles.filterChipLabelActive]}>
                {f.charAt(0) + f.slice(1).toLowerCase()}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.sectionTitle}>All Bookings</Text>

        {isPending ? (
          <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="calendar-outline" title="No bookings found" />
        ) : (
          filtered.map((b) => (
            <View
              key={b.id}
              style={[styles.card, b.status === 'CANCELLED' && styles.cardCancelled]}
            >
              <View style={styles.cardTopRow}>
                <Badge label="FOOTBALL TURF" tone="neutral" />
                <Badge label={STATUS_LABEL[b.status] ?? b.status} tone={STATUS_TONE[b.status] ?? 'neutral'} />
              </View>
              <Text style={[styles.cardTeam, b.status === 'CANCELLED' && styles.strike]}>{b.team?.name ?? 'Team'}</Text>
              <Text style={styles.cardRef}>{b.id.slice(0, 8).toUpperCase()}</Text>
              <View style={styles.cardDivider} />
              <Text style={styles.cardMeta}>
                {formatBookingDate(b.booking_date)} • {formatSlotTime(b.start_time)}–{formatSlotTime(b.end_time)}
              </Text>
              <Text style={styles.cardMeta}>{b.participant_count} Players</Text>

              {b.status === 'PENDING_REVIEW' && (
                <>
                  <Text style={styles.reviewHint}>Cross-check this slot on TurfTown before approving.</Text>
                  <View style={styles.reviewButtonRow}>
                    <Pressable
                      style={styles.approveButton}
                      onPress={() => handleApprove(b)}
                      disabled={reviewingId === b.id}
                    >
                      {reviewingId === b.id && decliningId !== b.id ? (
                        <ActivityIndicator size="small" color={colors.white} />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={14} color={colors.white} />
                          <Text style={styles.approveButtonText}>Approve</Text>
                        </>
                      )}
                    </Pressable>
                    <Pressable
                      style={styles.declineButton}
                      onPress={() => setDecliningId(decliningId === b.id ? null : b.id)}
                      disabled={reviewingId === b.id}
                    >
                      <Ionicons name="close-circle-outline" size={14} color={colors.danger} />
                      <Text style={styles.cancelButtonText}>Decline</Text>
                    </Pressable>
                  </View>
                  {decliningId === b.id && (
                    <View style={styles.declineCard}>
                      <TextField
                        placeholder="Reason (e.g. not available on TurfTown)"
                        value={declineReason}
                        onChangeText={setDeclineReason}
                      />
                      <View style={styles.reviewButtonRow}>
                        <Pressable
                          style={styles.declineCardCancel}
                          onPress={() => {
                            setDecliningId(null);
                            setDeclineReason('');
                          }}
                        >
                          <Text style={styles.declineCardCancelText}>Cancel</Text>
                        </Pressable>
                        <Pressable
                          style={styles.declineButton}
                          onPress={() => handleConfirmDecline(b)}
                          disabled={reviewingId === b.id}
                        >
                          {reviewingId === b.id ? (
                            <ActivityIndicator size="small" color={colors.danger} />
                          ) : (
                            <Text style={styles.cancelButtonText}>Confirm Decline</Text>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  )}
                </>
              )}

              {b.status === 'CONFIRMED' && (
                <Pressable
                  style={styles.cancelButton}
                  onPress={() => handleCancel(b)}
                  disabled={cancellingId === b.id}
                >
                  {cancellingId === b.id ? (
                    <ActivityIndicator size="small" color={colors.danger} />
                  ) : (
                    <>
                      <Ionicons name="close-circle-outline" size={14} color={colors.danger} />
                      <Text style={styles.cancelButtonText}>Cancel Booking</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          ))
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => router.push('/(admin)/booking/create-team')}>
        <Ionicons name="add" size={18} color="#FFFFFF" />
        <Text style={styles.fabLabel}>Create Booking</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: 100 },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },

  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statChip: { flex: 1, backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statChipAttention: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  statChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statChipLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  statChipLabelActive: { color: '#FFFFFF' },
  statChipValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 44,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 13, color: colors.text },

  filterRow: { flexDirection: 'row', marginTop: spacing.md },
  filterChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm },
  filterChipActive: { backgroundColor: colors.text, borderColor: colors.text },
  filterChipLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  filterChipLabelActive: { color: '#FFFFFF' },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },

  card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.sm, borderLeftWidth: 4, borderLeftColor: colors.primary, borderWidth: 1, borderColor: colors.border },
  cardCancelled: { backgroundColor: colors.dangerSoft, borderLeftColor: colors.danger },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cardTeam: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  strike: { textDecorationLine: 'line-through', color: colors.textMuted },
  cardRef: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  cardDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  cardMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  cancelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerSoft,
  },
  cancelButtonText: { fontSize: 12, fontWeight: '700', color: colors.danger },

  reviewHint: { fontSize: 11, color: colors.textMuted, fontStyle: 'italic', marginTop: spacing.sm },
  reviewButtonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  approveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
  },
  approveButtonText: { fontSize: 12, fontWeight: '700', color: colors.white },
  declineButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerSoft,
  },
  declineCard: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
    gap: spacing.sm,
  },
  declineCardCancel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  declineCardCancelText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },

  fab: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
    left: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
  },
  fabLabel: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
}));
