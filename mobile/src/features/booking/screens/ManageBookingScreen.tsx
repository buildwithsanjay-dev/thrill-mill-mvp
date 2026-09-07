import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { colors, radii, spacing } from '@/constants/theme';
import { useTeamMembers } from '@/features/team/useTeams';
import { formatBookingDate, formatSlotTime } from '@/utils/datetime';
import { cancelBooking, modifyParticipants } from '../api';
import {
  useBooking,
  useBookingParticipants,
  useInvalidateBookingQueries,
} from '../useBooking';

const STATUS_TONE = {
  CONFIRMED: 'active',
  COMPLETED: 'active',
  CANCELLED: 'danger',
  EXPIRED: 'danger',
  FAILED: 'danger',
  HOLDING: 'pending',
  IN_PROGRESS: 'pending',
} as const;

export function ManageBookingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: booking, isPending } = useBooking(id);
  const { data: participants } = useBookingParticipants(id);
  const { data: teamMembers } = useTeamMembers(booking?.team_id);
  const invalidate = useInvalidateBookingQueries();

  const [isEditing, setIsEditing] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  // A snapshot, not a ticking clock — Date.now() can't be called directly
  // during render (React's purity rule). Taken once at mount, which is
  // fine here: this only gates a UI affordance, the server (fn_modify_
  // participants) is what actually enforces the cutoff with real time.
  const [screenOpenedAt] = useState(() => Date.now());

  if (isPending || !booking) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const roleForUser = (userId: string) => teamMembers?.find((m) => m.user_id === userId)?.team_role;
  const activeParticipants = participants ?? [];
  const currentIds = activeParticipants.map((p) => p.user_id);
  const editableIds = isEditing ? pendingIds : currentIds;

  const startEditing = () => {
    setPendingIds(currentIds);
    setIsEditing(true);
  };

  const toggleMember = (userId: string) => {
    setPendingIds((prev) => (prev.includes(userId) ? prev.filter((x) => x !== userId) : [...prev, userId]));
  };

  const handleSaveParticipants = async () => {
    const toAdd = pendingIds.filter((id) => !currentIds.includes(id));
    const toRemove = currentIds.filter((id) => !pendingIds.includes(id));
    if (toAdd.length === 0 && toRemove.length === 0) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    try {
      await modifyParticipants(booking.id, toAdd, toRemove);
      invalidate({ bookingId: booking.id });
      setIsEditing(false);
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes('PARTICIPANTS_LOCKED')
          ? 'This session has already started — participants can no longer be changed.'
          : error instanceof Error
            ? error.message
            : 'Please try again.';
      Alert.alert('Could not update participants', message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel this booking?',
      'Full refund if cancelled 24 hours or more before the slot. No refund if cancelled within 24 hours — decided by server time.',
      [
        { text: 'Keep booking', style: 'cancel' },
        {
          text: 'Cancel booking',
          style: 'destructive',
          onPress: async () => {
            setIsCancelling(true);
            try {
              const outcome = await cancelBooking(booking.id);
              invalidate({ teamId: booking.team_id, bookingId: booking.id, turfId: booking.turf_id });
              Alert.alert(
                'Booking cancelled',
                outcome.includes('REFUND') ? 'Full credits were refunded to the Network wallet.' : 'No refund — cancelled within 24 hours of the slot.'
              );
              router.back();
            } catch (error) {
              Alert.alert('Could not cancel', error instanceof Error ? error.message : 'Please try again.');
            } finally {
              setIsCancelling(false);
            }
          },
        },
      ]
    );
  };

  const canManage = booking.status === 'CONFIRMED';

  // fn_modify_participants separately refuses this server-side once the
  // slot's start time has passed (server-authoritative, per CLAUDE.md) —
  // this only hides the affordance client-side so it isn't offered for a
  // booking that's already locked; cancellation has its own, different
  // 24-hour rule and isn't affected by this. Device-time approximation
  // only — the backend check is what actually decides.
  const sessionStart = new Date(`${booking.booking_date}T${booking.start_time}`);
  const canEditParticipants = canManage && screenOpenedAt < sessionStart.getTime();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Manage Booking</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.heroCard}>
          <View style={styles.heroBadge}>
            <Badge label={booking.status} tone={STATUS_TONE[booking.status] ?? 'neutral'} />
          </View>
          <Text style={styles.heroTitle}>{booking.turf?.name ?? 'Football Turf'}</Text>
          <Text style={styles.heroLocation}>
            <Ionicons name="location-outline" size={12} color="#94A3B8" /> Thrill Mill Arena
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Booking Details</Text>
        <View style={styles.detailsCard}>
          <View style={styles.detailsRow}>
            <DetailItem label="DATE" value={formatBookingDate(booking.booking_date)} />
            <DetailItem
              label="TIME"
              value={`${formatSlotTime(booking.start_time)} – ${formatSlotTime(booking.end_time)}`}
            />
          </View>
          <View style={styles.detailsRow}>
            <DetailItem label="DURATION" value={`${booking.duration_hours} Hour${booking.duration_hours === 1 ? '' : 's'}`} />
            <DetailItem label="REF ID" value={booking.id.slice(0, 8).toUpperCase()} />
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Participants</Text>
          <Text style={styles.counter}>{editableIds.length}/10</Text>
        </View>
        <View style={styles.participantsCard}>
          {isEditing
            ? teamMembers
                ?.filter((m) => m.status === 'ACTIVE')
                .map((m) => {
                  const checked = pendingIds.includes(m.user_id);
                  return (
                    <Pressable key={m.id} style={styles.participantRow} onPress={() => toggleMember(m.user_id)}>
                      <Avatar uri={m.profile?.avatar_url} name={m.profile?.full_name} size={32} />
                      <Text style={styles.participantName}>{m.profile?.full_name ?? 'Member'}</Text>
                      <Ionicons
                        name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={checked ? colors.primary : colors.border}
                      />
                    </Pressable>
                  );
                })
            : activeParticipants.map((p) => {
                const role = roleForUser(p.user_id);
                return (
                  <View key={p.id} style={styles.participantRow}>
                    <Avatar uri={p.profile?.avatar_url} name={p.profile?.full_name} size={32} />
                    <Text style={styles.participantName}>{p.profile?.full_name ?? 'Member'}</Text>
                    {role === 'HOST' && <Badge label="HOST" tone="host" />}
                    {role === 'CO_HOST' && <Badge label="CO-HOST" tone="coHost" />}
                  </View>
                );
              })}

          {isEditing ? (
            <View style={styles.editActionsRow}>
              <Pressable style={styles.cancelEditButton} onPress={() => setIsEditing(false)}>
                <Text style={styles.cancelEditText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveEditButton} onPress={handleSaveParticipants} disabled={isSaving}>
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveEditText}>Save</Text>
                )}
              </Pressable>
            </View>
          ) : (
            canEditParticipants && (
              <Pressable style={styles.addMemberRow} onPress={startEditing}>
                <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                <Text style={styles.addMemberText}>Add / Remove Network Member</Text>
              </Pressable>
            )
          )}
          {!canEditParticipants && canManage && !isEditing && (
            <Text style={styles.lockedNote}>Participants are locked once the session starts.</Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>Wallet &amp; Credits</Text>
        <View style={styles.walletCard}>
          <View style={styles.walletTopRow}>
            <View>
              <Text style={styles.walletLabel}>TOTAL COST</Text>
              <Text style={styles.walletValue}>{Math.round(booking.total_credits)} Credits</Text>
            </View>
            <Ionicons name="card-outline" size={22} color="#5EEAD4" />
          </View>
          <Text style={styles.walletNote}>
            Cost is deducted from the shared wallet. Individual usage is calculated and attributed
            post-game based on final participant count.
          </Text>
        </View>

        {canManage && (
          <View style={styles.policyCard}>
            <Ionicons name="alert-circle" size={16} color="#B91C1C" />
            <Text style={styles.policyText}>
              Cancellation Policy: Full refund if cancelled 24 hours or more before the slot.
              Cancellations within 24 hours receive no refund.
            </Text>
          </View>
        )}
      </ScrollView>

      {canManage && !isEditing && (
        <View style={styles.footer}>
          <Pressable style={styles.cancelBookingButton} onPress={handleCancel} disabled={isCancelling}>
            {isCancelling ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Text style={styles.cancelBookingText}>Cancel Booking</Text>
            )}
          </Pressable>
          {canEditParticipants && (
            <View style={{ flex: 1 }}>
              <Button title="Update Participants" iconLeft="create-outline" onPress={startEditing} />
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
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

  heroCard: { height: 130, borderRadius: radii.lg, backgroundColor: '#14532D', padding: spacing.lg, justifyContent: 'flex-end' },
  heroBadge: { position: 'absolute', top: spacing.md, right: spacing.md },
  heroTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  heroLocation: { fontSize: 12, color: '#A7F3D0', marginTop: 4 },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xl },
  counter: { fontSize: 12, fontWeight: '700', color: colors.textMuted },

  detailsCard: { backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  detailsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailItem: {},
  detailLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 },
  detailValue: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 4 },

  participantsCard: { backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  participantRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  participantName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },

  addMemberRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingTop: spacing.sm },
  addMemberText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  lockedNote: { fontSize: 12, color: colors.textMuted, textAlign: 'center', paddingTop: spacing.sm },

  editActionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  cancelEditButton: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, alignItems: 'center', paddingVertical: spacing.sm },
  cancelEditText: { fontSize: 13, fontWeight: '700', color: colors.text },
  saveEditButton: { flex: 1, backgroundColor: colors.primary, borderRadius: radii.pill, alignItems: 'center', paddingVertical: spacing.sm },
  saveEditText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  walletCard: { backgroundColor: '#0F1729', borderRadius: radii.lg, padding: spacing.lg },
  walletTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  walletLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.3 },
  walletValue: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginTop: 4 },
  walletNote: { fontSize: 11, color: '#94A3B8', marginTop: spacing.md, lineHeight: 16 },

  policyCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: '#FEF2F2',
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  policyText: { flex: 1, fontSize: 12, color: '#991B1B', lineHeight: 17 },

  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  cancelBookingButton: {
    borderWidth: 1.5,
    borderColor: colors.text,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBookingText: { fontSize: 14, fontWeight: '700', color: colors.text },
});
