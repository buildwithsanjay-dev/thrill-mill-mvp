import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, radii, spacing, themedStyles } from '@/constants/theme';
import { useTurfResources, useTurfSlots } from '@/features/booking/useBooking';
import { addDaysIso, formatDayLabel, formatSlotTime, isSlotInPast, todayIso } from '@/utils/datetime';
import { adminBlockSlot, adminUnblockSlot } from '../api';
import type { TurfSlot } from '@/types/db';
import { showAlert } from '@/components/AppDialog';
import { friendlyError } from '@/lib/errors';

const DATE_WINDOW = 14;

export function BlockSlotScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: turfResources } = useTurfResources();
  const [selectedSport, setSelectedSport] = useState<'TURF' | 'PICKLEBALL'>('TURF');
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

  // Same Sport/Court selection pattern as BookTurfScreen.tsx/SelectSlotScreen.tsx
  // (whole-branch review Finding 6) — without this, none of the 4 Pickleball
  // courts could ever be blocked for maintenance through this screen, since
  // the derivation used to be hardcoded to the single Turf resource.
  const resourcesForSport = useMemo(
    () => (turfResources ?? []).filter((r) => r.sport === selectedSport),
    [turfResources, selectedSport]
  );
  const turf = selectedSport === 'TURF'
    ? resourcesForSport[0]
    : resourcesForSport.find((r) => r.id === selectedResourceId);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset when the resolved resource changes (sport/court switch)
    setSelectedResourceId(null);
  }, [selectedSport]);

  const [selectedDate, setSelectedDate] = useState(todayIso());
  const { data: slots, isPending, refetch } = useTurfSlots(turf?.id, selectedDate);
  const [selectedSlot, setSelectedSlot] = useState<TurfSlot | null>(null);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Every screen that lists slots (Book, Admin booking, this one) reads the same
  // ['turf-slots', ...] queries — refresh them all so a block / unblock shows up
  // everywhere on this device at once (other phones pick it up on their 15s poll).
  const refreshAllSlots = () => queryClient.invalidateQueries({ queryKey: ['turf-slots'] });

  const dateOptions = Array.from({ length: DATE_WINDOW }, (_, i) => addDaysIso(todayIso(), i));

  const handleBlock = async () => {
    if (!selectedSlot || !reason.trim()) {
      showAlert('Reason required', 'Enter a reason for blocking this slot.');
      return;
    }
    setIsSubmitting(true);
    try {
      await adminBlockSlot(selectedSlot.id, reason.trim());
      setSelectedSlot(null);
      setReason('');
      refetch();
      refreshAllSlots();
      showAlert('Slot blocked', 'This slot is no longer bookable.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? error);
      showAlert(
        'Could not block slot',
        message.includes('SLOT_IN_PAST')
          ? 'This slot has already started or finished, so it cannot be blocked.'
          : friendlyError(error)
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnblock = (slot: TurfSlot) => {
    showAlert('Unblock this slot?', 'It will become bookable again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          try {
            await adminUnblockSlot(slot.id);
            refetch();
            refreshAllSlots();
          } catch (error) {
            showAlert('Could not unblock slot', friendlyError(error));
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Block Slot</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionTitle}>Select Sport</Text>
        <View style={styles.sportRow}>
          {(['TURF', 'PICKLEBALL'] as const).map((sport) => (
            <Pressable
              key={sport}
              style={[styles.sportChip, selectedSport === sport && styles.sportChipSelected]}
              onPress={() => {
                setSelectedSport(sport);
                setSelectedSlot(null);
              }}
            >
              <Ionicons
                name={sport === 'TURF' ? 'football-outline' : 'tennisball-outline'}
                size={16}
                color={selectedSport === sport ? '#FFFFFF' : colors.text}
              />
              <Text style={[styles.sportChipText, selectedSport === sport && styles.sportChipTextSelected]}>
                {sport === 'TURF' ? 'Turf' : 'Pickleball'}
              </Text>
            </Pressable>
          ))}
        </View>

        {selectedSport === 'PICKLEBALL' && (
          <>
            <Text style={styles.sectionTitle}>Select Court</Text>
            <View style={styles.sportRow}>
              {resourcesForSport.map((court) => (
                <Pressable
                  key={court.id}
                  style={[styles.sportChip, selectedResourceId === court.id && styles.sportChipSelected]}
                  onPress={() => {
                    setSelectedResourceId(court.id);
                    setSelectedSlot(null);
                  }}
                >
                  <Text style={[styles.sportChipText, selectedResourceId === court.id && styles.sportChipTextSelected]}>
                    {court.name.replace('Pickleball ', '')}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

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
                }}
              >
                <Text style={[styles.dateWeekday, isSelected && styles.dateTextSelected]}>{weekday}</Text>
                <Text style={[styles.dateDay, isSelected && styles.dateTextSelected]}>{day}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.sectionTitle}>Slots</Text>
        {selectedSport === 'PICKLEBALL' && !turf ? (
          <Text style={styles.hintText}>Select a court above to see availability.</Text>
        ) : isPending ? (
          <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} />
        ) : (
          <View style={styles.slotGrid}>
            {(slots ?? []).map((slot) => {
              const isSelected = selectedSlot?.id === slot.id;
              const isPast = isSlotInPast(selectedDate, slot.start_time);
              const isBlocked = slot.status === 'BLOCKED' && !isPast;
              // Same rule as the Book screens: a slot that has started is passed and
              // can't be acted on; booked / held slots can't be blocked either.
              const isDisabled = !isBlocked && (isPast || slot.status !== 'AVAILABLE');
              const statusLabel = isSelected
                ? 'Selected'
                : isPast
                  ? 'Passed'
                  : isBlocked
                    ? 'Blocked · tap to unblock'
                    : slot.status === 'AVAILABLE'
                      ? 'Available'
                      : 'Booked';
              return (
                <Pressable
                  key={slot.id}
                  style={[
                    styles.slotChip,
                    isSelected && styles.slotChipSelected,
                    isBlocked && styles.slotChipBlocked,
                    isDisabled && styles.slotChipDisabled,
                  ]}
                  disabled={isDisabled}
                  onPress={() => (isBlocked ? handleUnblock(slot) : setSelectedSlot(slot))}
                >
                  <Text
                    style={[
                      styles.slotText,
                      isSelected && styles.slotTextSelected,
                      isBlocked && styles.slotTextBlocked,
                      isDisabled && styles.slotTextDisabled,
                    ]}
                  >
                    {formatSlotTime(slot.start_time)}
                  </Text>
                  <Text
                    style={[
                      styles.slotSubText,
                      isBlocked && styles.slotSubTextBlocked,
                      isSelected && styles.slotSubTextSelected,
                      isDisabled && styles.slotSubTextDisabled,
                    ]}
                  >
                    {statusLabel}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {selectedSlot && (
          <View style={styles.reasonCard}>
            <Text style={styles.reasonTitle}>
              Block {formatSlotTime(selectedSlot.start_time)}–{formatSlotTime(selectedSlot.end_time)}
            </Text>
            <TextField placeholder="Reason (e.g. maintenance)" value={reason} onChangeText={setReason} />
          </View>
        )}
      </ScrollView>

      {selectedSlot && (
        <View style={styles.footer}>
          <Button title="Block Slot" onPress={handleBlock} loading={isSubmitting} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: spacing.lg, marginBottom: spacing.sm },
  sportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sportChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sportChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  sportChipText: { fontSize: 13, fontWeight: '700', color: colors.text },
  sportChipTextSelected: { color: '#FFFFFF' },
  hintText: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic', marginTop: spacing.sm },
  dateRow: { flexDirection: 'row' },
  dateChip: { width: 56, height: 60, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm, backgroundColor: colors.surface },
  dateChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dateWeekday: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  dateDay: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 2 },
  dateTextSelected: { color: '#FFFFFF' },

  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slotChip: { width: '31%', paddingVertical: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.surface },
  slotChipSelected: { backgroundColor: colors.danger, borderColor: colors.danger },
  slotChipBlocked: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder },
  slotChipDisabled: { backgroundColor: 'transparent', borderColor: colors.border, borderStyle: 'dashed', opacity: 0.8 },
  slotText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  slotTextSelected: { color: '#FFFFFF' },
  slotTextBlocked: { color: colors.danger },
  slotTextDisabled: { color: colors.textFaint, fontWeight: '600', textDecorationLine: 'line-through' },
  slotSubText: { fontSize: 10, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  slotSubTextBlocked: { color: colors.danger },
  slotSubTextSelected: { color: colors.white },
  slotSubTextDisabled: { color: colors.textFaint },

  reasonCard: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.xl, borderWidth: 1, borderColor: colors.border },
  reasonTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: spacing.md },

  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
}));
