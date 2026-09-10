import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, radii, spacing } from '@/constants/theme';
import { useTurfResources, useTurfSlots } from '@/features/booking/useBooking';
import { addDaysIso, formatDayLabel, formatSlotTime, todayIso } from '@/utils/datetime';
import { adminBlockSlot, adminUnblockSlot } from '../api';
import type { TurfSlot } from '@/types/db';

const DATE_WINDOW = 14;

export function BlockSlotScreen() {
  const router = useRouter();
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

  const dateOptions = Array.from({ length: DATE_WINDOW }, (_, i) => addDaysIso(todayIso(), i));

  const handleBlock = async () => {
    if (!selectedSlot || !reason.trim()) {
      Alert.alert('Reason required', 'Enter a reason for blocking this slot.');
      return;
    }
    setIsSubmitting(true);
    try {
      await adminBlockSlot(selectedSlot.id, reason.trim());
      setSelectedSlot(null);
      setReason('');
      refetch();
      Alert.alert('Slot blocked', 'This slot is no longer bookable.');
    } catch (error) {
      Alert.alert('Could not block slot', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUnblock = (slot: TurfSlot) => {
    Alert.alert('Unblock this slot?', 'It will become bookable again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          try {
            await adminUnblockSlot(slot.id);
            refetch();
          } catch (error) {
            Alert.alert('Could not unblock slot', error instanceof Error ? error.message : 'Please try again.');
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
              const isBlocked = slot.status === 'BLOCKED';
              const isDisabled = slot.status !== 'AVAILABLE' && !isBlocked;
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
                  {isBlocked && <Text style={styles.slotSubText}>Blocked · tap to unblock</Text>}
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
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
    backgroundColor: '#FFFFFF',
  },
  sportChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  sportChipText: { fontSize: 13, fontWeight: '700', color: colors.text },
  sportChipTextSelected: { color: '#FFFFFF' },
  hintText: { fontSize: 13, color: colors.textMuted, fontStyle: 'italic', marginTop: spacing.sm },
  dateRow: { flexDirection: 'row' },
  dateChip: { width: 56, height: 60, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm, backgroundColor: '#FFFFFF' },
  dateChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dateWeekday: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  dateDay: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 2 },
  dateTextSelected: { color: '#FFFFFF' },

  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slotChip: { width: '31%', paddingVertical: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: '#FFFFFF' },
  slotChipSelected: { backgroundColor: colors.danger, borderColor: colors.danger },
  slotChipBlocked: { backgroundColor: '#FEE2E2', borderColor: '#FECACA' },
  slotChipDisabled: { backgroundColor: '#F1F5F9', borderColor: '#F1F5F9' },
  slotText: { fontSize: 13, fontWeight: '700', color: colors.text },
  slotTextSelected: { color: '#FFFFFF' },
  slotTextBlocked: { color: '#B91C1C' },
  slotTextDisabled: { color: colors.textMuted },
  slotSubText: { fontSize: 9, color: '#B91C1C', marginTop: 2 },

  reasonCard: { backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.xl, borderWidth: 1, borderColor: colors.border },
  reasonTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: spacing.md },

  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
});
