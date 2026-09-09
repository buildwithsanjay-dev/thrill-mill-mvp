import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing } from '@/constants/theme';
import { teamDetailsQueryKey } from '@/features/team/useTeams';
import { formatBookingDate, formatSlotTime, todayIso } from '@/utils/datetime';
import { adminCancelBooking, type AdminBookingRow } from '../api';
import { useAllBookings, useInvalidateAdminQueries } from '../useAdmin';

type Filter = 'ALL' | 'TODAY' | 'UPCOMING' | 'COMPLETED';

const STATUS_TONE: Record<string, 'active' | 'danger' | 'pending' | 'neutral'> = {
  CONFIRMED: 'active',
  COMPLETED: 'neutral',
  CANCELLED: 'danger',
  EXPIRED: 'danger',
  FAILED: 'danger',
  HOLDING: 'pending',
  IN_PROGRESS: 'pending',
};

export function AdminBookingsScreen() {
  const router = useRouter();
  const { data: bookings, isPending } = useAllBookings();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const invalidateAdmin = useInvalidateAdminQueries();

  const handleCancel = (booking: AdminBookingRow) => {
    Alert.alert(
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
              invalidateAdmin();
              queryClient.invalidateQueries({ queryKey: ['team-bookings', booking.team_id] });
              queryClient.invalidateQueries({ queryKey: ['team-wallet', booking.team_id] });
              queryClient.invalidateQueries({ queryKey: teamDetailsQueryKey(booking.team_id) });
              queryClient.invalidateQueries({ queryKey: ['turf-slots', booking.turf_id] });
              queryClient.invalidateQueries({ queryKey: ['booking', booking.id] });
              Alert.alert(
                'Booking cancelled',
                outcome === 'CANCELLED_REFUNDED'
                  ? 'Full credits were refunded to the Team wallet.'
                  : 'No refund — cancelled within 24 hours of the slot.'
              );
            } catch (error) {
              Alert.alert('Could not cancel', error instanceof Error ? error.message : 'Please try again.');
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
      today: rows.filter((b) => b.booking_date === today).length,
      upcoming: rows.filter((b) => b.booking_date > today && b.status === 'CONFIRMED').length,
      completed: rows.filter((b) => b.status === 'COMPLETED').length,
    };
  }, [bookings, today]);

  const filtered = useMemo(() => {
    let rows = bookings ?? [];
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
      <ScrollView contentContainerStyle={styles.scroll}>
        <AppHeader>
          <Text style={styles.title}>Bookings</Text>
        </AppHeader>

        <View style={styles.statsRow}>
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
          {(['ALL', 'TODAY', 'UPCOMING', 'COMPLETED'] as Filter[]).map((f) => (
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
                <Badge label={b.status} tone={STATUS_TONE[b.status] ?? 'neutral'} />
              </View>
              <Text style={[styles.cardTeam, b.status === 'CANCELLED' && styles.strike]}>{b.team?.name ?? 'Team'}</Text>
              <Text style={styles.cardRef}>{b.id.slice(0, 8).toUpperCase()}</Text>
              <View style={styles.cardDivider} />
              <Text style={styles.cardMeta}>
                {formatBookingDate(b.booking_date)} • {formatSlotTime(b.start_time)}–{formatSlotTime(b.end_time)}
              </Text>
              <Text style={styles.cardMeta}>{b.participant_count} Players</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  scroll: { padding: spacing.lg, paddingBottom: 100 },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },

  statsRow: { flexDirection: 'row', gap: spacing.sm },
  statChip: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: radii.md, padding: spacing.md, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  statChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  statChipLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  statChipLabelActive: { color: '#FFFFFF' },
  statChipValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 44,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 13, color: colors.text },

  filterRow: { flexDirection: 'row', marginTop: spacing.md },
  filterChip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.border, marginRight: spacing.sm },
  filterChipActive: { backgroundColor: colors.text, borderColor: colors.text },
  filterChipLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  filterChipLabelActive: { color: '#FFFFFF' },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },

  card: { backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.md, marginBottom: spacing.sm, borderLeftWidth: 4, borderLeftColor: colors.primary, borderWidth: 1, borderColor: colors.border },
  cardCancelled: { backgroundColor: '#FEF2F2', borderLeftColor: colors.danger },
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
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
  cancelButtonText: { fontSize: 12, fontWeight: '700', color: colors.danger },

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
});
