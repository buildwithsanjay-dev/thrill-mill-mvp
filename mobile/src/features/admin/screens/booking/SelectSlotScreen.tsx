import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { colors, radii, spacing } from '@/constants/theme';
import { createSlotHold } from '@/features/booking/api';
import { useDefaultTurf, useInvalidateBookingQueries, useTurfSlots } from '@/features/booking/useBooking';
import { useTeamDetails } from '@/features/team/useTeams';
import { useAdminBookingDraft } from '@/stores/adminBookingDraft';
import { addDaysIso, formatDayLabel, formatSlotTime, todayIso } from '@/utils/datetime';
import { adminConfirmBookingForHost } from '../../api';
import type { TurfSlot } from '@/types/db';

const DATE_WINDOW = 14;

// Backend note: fn_admin_confirm_booking_for_host defaults the Team's Host
// as sole participant (the Figma design has no participant-picker step at
// all). Both fn_create_slot_hold and fn_confirm_booking operate on exactly
// one Turf slot per booking — the Figma's "2 Hours" multi-slot selection
// isn't something the current schema supports (a booking is one
// turf_slots row), so this screen offers single-slot selection only.
export function SelectSlotScreen() {
  const router = useRouter();
  const { teamId, teamName, teamJoinCode, walletCredits } = useAdminBookingDraft();
  const { data: turf } = useDefaultTurf();
  const { data: teamDetails } = useTeamDetails(teamId ?? undefined);
  const invalidateBooking = useInvalidateBookingQueries();

  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [selectedSlot, setSelectedSlot] = useState<TurfSlot | null>(null);
  const [hold, setHold] = useState<{ holdId: string; expiresAt: number } | null>(null);
  const [isHolding, setIsHolding] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const { data: slots, isPending: slotsPending } = useTurfSlots(turf?.id, selectedDate);

  useEffect(() => {
    if (!teamId) router.replace('/(admin)/booking/create-team');
  }, [teamId, router]);

  const dateOptions = useMemo(() => Array.from({ length: DATE_WINDOW }, (_, i) => addDaysIso(todayIso(), i)), []);
  const plan = teamDetails?.membership?.plan;

  const previewCredits = useMemo(() => {
    if (!selectedSlot || !plan) return null;
    const hour = parseInt(selectedSlot.start_time.split(':')[0], 10);
    const isDay = hour >= 5 && hour < 17;
    return isDay ? plan.membership_day_rate_per_hour : plan.membership_night_rate_per_hour;
  }, [selectedSlot, plan]);

  if (!teamId) return null;

  const handleSelectSlot = async (slot: TurfSlot) => {
    if (slot.status !== 'AVAILABLE') return;
    setIsHolding(true);
    try {
      const result = await createSlotHold(slot.id, teamId);
      setSelectedSlot(slot);
      setHold({ holdId: result.hold_id, expiresAt: new Date(result.expires_at).getTime() });
    } catch (error) {
      Alert.alert('Could not hold slot', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsHolding(false);
    }
  };

  const handleConfirm = async () => {
    if (!hold) return;
    setIsConfirming(true);
    try {
      await adminConfirmBookingForHost(hold.holdId);
      invalidateBooking({ teamId, turfId: turf?.id });
      Alert.alert('Booking confirmed', `Booking created for ${teamName}.`);
      router.replace('/(admin)/(tabs)/bookings');
    } catch (error) {
      Alert.alert('Booking failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Create Booking</Text>
          <Text style={styles.headerSubtitle}>Select a Turf slot for the Team.</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.stepMeta}>
        <Text style={styles.stepMetaLabel}>STEP 2 OF 2</Text>
        <Text style={styles.stepMetaValue}>SELECT SLOT</Text>
      </View>
      <View style={styles.progressBar}>
        <View style={styles.progressFillFull} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.teamCard}>
          <View style={styles.teamTopRow}>
            <Text style={styles.teamName}>{teamName}</Text>
            <Text style={styles.changeLink} onPress={() => router.back()}>
              Change
            </Text>
          </View>
          <Text style={styles.teamId}>{teamJoinCode}</Text>
          <View style={styles.teamBottomRow}>
            <Text style={styles.teamMeta}>₹{Math.round(walletCredits).toLocaleString()} Credits</Text>
            {plan && <Text style={styles.teamMeta}>{plan.name}</Text>}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Select Date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateRow}>
          {dateOptions.map((iso) => {
            const { weekday, day } = formatDayLabel(iso);
            const isSelected = iso === selectedDate;
            return (
              <Pressable
                key={iso}
                style={[styles.dateChip, isSelected && styles.dateChipSelected]}
                onPress={() => {
                  setSelectedDate(iso);
                  setSelectedSlot(null);
                  setHold(null);
                }}
              >
                <Text style={[styles.dateWeekday, isSelected && styles.dateTextSelected]}>{weekday}</Text>
                <Text style={[styles.dateDay, isSelected && styles.dateTextSelected]}>{day}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.sectionTitle}>Select Slot</Text>
        {slotsPending ? (
          <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} />
        ) : (
          <View style={styles.slotGrid}>
            {(slots ?? []).map((slot) => {
              const isSelected = selectedSlot?.id === slot.id;
              const isDisabled = slot.status !== 'AVAILABLE' && !isSelected;
              return (
                <Pressable
                  key={slot.id}
                  style={[styles.slotChip, isSelected && styles.slotChipSelected, isDisabled && styles.slotChipDisabled]}
                  disabled={isDisabled || isHolding}
                  onPress={() => handleSelectSlot(slot)}
                >
                  <Text style={[styles.slotText, isSelected && styles.slotTextSelected, isDisabled && styles.slotTextDisabled]}>
                    {formatSlotTime(slot.start_time)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {selectedSlot && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Booking Summary</Text>
            <View style={styles.summaryRow}>
              <Ionicons name="location-outline" size={14} color={colors.textMuted} />
              <Text style={styles.summaryText}>{turf?.name ?? 'Thrill Mill Turf'}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Ionicons name="time-outline" size={14} color={colors.textMuted} />
              <Text style={styles.summaryText}>
                {formatSlotTime(selectedSlot.start_time)}–{formatSlotTime(selectedSlot.end_time)}
              </Text>
            </View>
            {previewCredits !== null && (
              <View style={styles.totalBox}>
                <Text style={styles.totalLabel}>Estimated Total (server-confirmed on submit)</Text>
                <Text style={styles.totalValue}>{previewCredits} CR</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {selectedSlot && hold && (
        <View style={styles.footer}>
          <Button title="Confirm Booking" iconLeft="checkmark-circle-outline" onPress={handleConfirm} loading={isConfirming} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  headerSubtitle: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  stepMeta: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  stepMetaLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.4 },
  stepMetaValue: { fontSize: 11, fontWeight: '700', color: colors.text, letterSpacing: 0.4 },
  progressBar: { height: 4, backgroundColor: colors.border, borderRadius: 2, marginHorizontal: spacing.lg, marginTop: spacing.sm, overflow: 'hidden' },
  progressFillFull: { width: '100%', height: '100%', backgroundColor: colors.primary },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },

  teamCard: { backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  teamTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  teamName: { fontSize: 16, fontWeight: '800', color: colors.text },
  changeLink: { fontSize: 12, fontWeight: '700', color: colors.primary },
  teamId: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  teamBottomRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  teamMeta: { fontSize: 12, fontWeight: '700', color: colors.text },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },
  dateRow: { flexDirection: 'row' },
  dateChip: { width: 56, height: 60, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm, backgroundColor: '#FFFFFF' },
  dateChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dateWeekday: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  dateDay: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 2 },
  dateTextSelected: { color: '#FFFFFF' },

  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slotChip: { width: '31%', paddingVertical: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: '#FFFFFF' },
  slotChipSelected: { backgroundColor: colors.text, borderColor: colors.text },
  slotChipDisabled: { backgroundColor: '#F1F5F9', borderColor: '#F1F5F9' },
  slotText: { fontSize: 13, fontWeight: '700', color: colors.text },
  slotTextSelected: { color: '#FFFFFF' },
  slotTextDisabled: { color: colors.textMuted },

  summaryCard: { backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.xl, borderWidth: 1, borderColor: colors.border },
  summaryTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  summaryText: { fontSize: 12, color: colors.textMuted },
  totalBox: { backgroundColor: '#F8FAFC', borderRadius: radii.sm, padding: spacing.md, marginTop: spacing.sm },
  totalLabel: { fontSize: 10, color: colors.textMuted },
  totalValue: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 },

  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
});
