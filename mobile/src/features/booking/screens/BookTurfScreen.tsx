import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMyTeams, useTeamMembers } from '@/features/team/useTeams';
import { useActiveTeamStore } from '@/stores/activeTeam';
import { addDaysIso, formatDayLabel, formatSlotTime, todayIso } from '@/utils/datetime';
import { confirmBooking, createSlotHold } from '../api';
import { useDefaultTurf, useInvalidateBookingQueries, useTurfSlots } from '../useBooking';
import type { TurfSlot } from '@/types/db';

const DATE_WINDOW = 14;

export function BookTurfScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { data: teams, isPending: teamsPending } = useMyTeams();
  const { activeTeamId, setActiveTeamId } = useActiveTeamStore();
  const { data: turf } = useDefaultTurf();
  const invalidateBooking = useInvalidateBookingQueries();

  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [selectedSlot, setSelectedSlot] = useState<TurfSlot | null>(null);
  const [hold, setHold] = useState<{ holdId: string; expiresAt: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [isHolding, setIsHolding] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  const activeTeam = useMemo(
    () => teams?.find((t) => t.team.id === activeTeamId) ?? teams?.[0],
    [teams, activeTeamId]
  );
  useEffect(() => {
    if (teams && teams.length > 0 && !activeTeamId) setActiveTeamId(teams[0].team.id);
  }, [teams, activeTeamId, setActiveTeamId]);

  const { data: slots, isPending: slotsPending } = useTurfSlots(turf?.id, selectedDate);
  const { data: members } = useTeamMembers(activeTeam?.team.id);
  const activeMembers = (members ?? []).filter((m) => m.status === 'ACTIVE');

  // Derived, not stored: defaults to "just me" until the user explicitly
  // toggles someone, without needing an effect to seed state once the
  // session/member list finish loading.
  const effectiveParticipantIds =
    selectedParticipantIds.length > 0 ? selectedParticipantIds : session?.user.id ? [session.user.id] : [];

  useEffect(() => {
    if (!hold) return;
    const tick = () => {
      const remaining = Math.max(0, Math.round((hold.expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        setHold(null);
        setSelectedSlot(null);
        Alert.alert('Hold expired', 'Your slot hold expired. Please select a slot again.');
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [hold]);

  const dateOptions = useMemo(
    () => Array.from({ length: DATE_WINDOW }, (_, i) => addDaysIso(todayIso(), i)),
    []
  );

  if (teamsPending) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (!activeTeam) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AppHeader>
            <Text style={styles.title}>Book Turf</Text>
          </AppHeader>
        </View>
        <EmptyState
          icon="football-outline"
          title="No Network yet"
          message="Create or join a Network before booking a Turf."
        />
      </SafeAreaView>
    );
  }

  const handleSelectSlot = async (slot: TurfSlot) => {
    if (slot.status !== 'AVAILABLE') return;
    setIsHolding(true);
    try {
      const result = await createSlotHold(slot.id, activeTeam.team.id);
      setSelectedSlot(slot);
      setHold({ holdId: result.hold_id, expiresAt: new Date(result.expires_at).getTime() });
    } catch (error) {
      const msg =
        error instanceof Error && error.message.includes('SLOT_UNAVAILABLE')
          ? 'That slot was just taken. Pick another.'
          : error instanceof Error
            ? error.message
            : 'Please try again.';
      Alert.alert('Could not hold slot', msg);
    } finally {
      setIsHolding(false);
    }
  };

  const toggleParticipant = (userId: string) => {
    setSelectedParticipantIds(
      effectiveParticipantIds.includes(userId)
        ? effectiveParticipantIds.filter((id) => id !== userId)
        : [...effectiveParticipantIds, userId]
    );
  };

  const handleConfirm = async () => {
    if (!hold || effectiveParticipantIds.length === 0) return;
    setIsConfirming(true);
    try {
      const bookingId = await confirmBooking(hold.holdId, effectiveParticipantIds);
      invalidateBooking({ teamId: activeTeam.team.id, turfId: turf?.id });
      setHold(null);
      setSelectedSlot(null);
      router.replace(`/(app)/booking/${bookingId}`);
    } catch (error) {
      const msg =
        error instanceof Error && error.message.includes('INSUFFICIENT_CREDITS')
          ? 'Not enough Network credits for this booking.'
          : error instanceof Error && error.message.includes('HOLD_EXPIRED')
            ? 'Your hold expired before confirming. Please try again.'
            : error instanceof Error
              ? error.message
              : 'Please try again.';
      Alert.alert('Booking failed', msg);
      setHold(null);
      setSelectedSlot(null);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <AppHeader>
          <Text style={styles.title}>Book Turf</Text>
        </AppHeader>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.teamPill}>
          <Ionicons name="business" size={16} color={colors.textMuted} />
          <View style={{ marginLeft: spacing.sm }}>
            <Text style={styles.teamPillLabel}>YOUR SELECTED NETWORK</Text>
            <Text style={styles.teamPillValue}>{activeTeam.team.name}</Text>
          </View>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>{turf?.name ?? 'Thrill Mill Turf'}</Text>
          <View style={styles.heroBadgeRow}>
            <View style={styles.heroDot} />
            <Text style={styles.heroBadgeText}>Available for booking</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Select Date</Text>
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

        <Text style={styles.sectionLabel}>Available Slots</Text>
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
                  style={[
                    styles.slotChip,
                    isSelected && styles.slotChipSelected,
                    isDisabled && styles.slotChipDisabled,
                  ]}
                  disabled={isDisabled || isHolding}
                  onPress={() => handleSelectSlot(slot)}
                >
                  <Text
                    style={[
                      styles.slotText,
                      isSelected && styles.slotTextSelected,
                      isDisabled && styles.slotTextDisabled,
                    ]}
                  >
                    {formatSlotTime(slot.start_time)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        {selectedSlot && (
          <>
            <Text style={styles.sectionLabel}>Players</Text>
            {activeMembers.map((m) => {
              const checked = effectiveParticipantIds.includes(m.user_id);
              return (
                <Pressable key={m.id} style={styles.playerRow} onPress={() => toggleParticipant(m.user_id)}>
                  <Avatar uri={m.profile?.avatar_url} name={m.profile?.full_name} size={36} />
                  <Text style={styles.playerName}>
                    {m.user_id === session?.user.id ? 'You' : (m.profile?.full_name ?? 'Member')}
                  </Text>
                  <Ionicons
                    name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={checked ? colors.primary : colors.border}
                  />
                </Pressable>
              );
            })}
          </>
        )}
      </ScrollView>

      {selectedSlot && hold && (
        <View style={styles.confirmBar}>
          <View style={styles.confirmTopRow}>
            <View>
              <Text style={styles.confirmLabel}>SLOT HELD</Text>
              <Text style={styles.confirmMeta}>
                {formatSlotTime(selectedSlot.start_time)}–{formatSlotTime(selectedSlot.end_time)} ·{' '}
                {effectiveParticipantIds.length} Players
              </Text>
            </View>
            <Text style={styles.confirmTimer}>
              <Ionicons name="time-outline" size={14} color="#FBBF24" /> {secondsLeft}s
            </Text>
          </View>
          <Button
            title="Hold & Confirm"
            onPress={handleConfirm}
            loading={isConfirming}
            disabled={effectiveParticipantIds.length === 0}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA' },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },

  teamPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  teamPillLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 },
  teamPillValue: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 2 },

  heroCard: {
    height: 130,
    borderRadius: radii.lg,
    backgroundColor: '#0C4A45',
    marginTop: spacing.md,
    padding: spacing.lg,
    justifyContent: 'flex-end',
  },
  heroTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  heroBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  heroDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#5EEAD4' },
  heroBadgeText: { fontSize: 12, color: '#A7F3D0', fontWeight: '600' },

  sectionLabel: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },
  dateRow: { flexDirection: 'row' },
  dateChip: {
    width: 60,
    height: 64,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
    backgroundColor: '#FFFFFF',
  },
  dateChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dateWeekday: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  dateDay: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 2 },
  dateTextSelected: { color: '#FFFFFF' },

  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slotChip: {
    width: '31%',
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  slotChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  slotChipDisabled: { backgroundColor: '#F1F5F9', borderColor: '#F1F5F9' },
  slotText: { fontSize: 13, fontWeight: '700', color: colors.text },
  slotTextSelected: { color: '#FFFFFF' },
  slotTextDisabled: { color: colors.textMuted },

  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  playerName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },

  confirmBar: {
    backgroundColor: '#0F1729',
    padding: spacing.lg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
  },
  confirmTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  confirmLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.4 },
  confirmMeta: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', marginTop: 2 },
  confirmTimer: { fontSize: 13, fontWeight: '700', color: '#FBBF24' },
});
