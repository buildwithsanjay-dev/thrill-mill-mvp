import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { useMyTeams, useTeamDetails, useTeamMembers } from '@/features/team/useTeams';
import { useActiveTeamStore } from '@/stores/activeTeam';
import { addDaysIso, formatBookingDate, formatDayLabel, formatSlotTime, todayIso } from '@/utils/datetime';
import { confirmMultiSlotBooking, createSlotHold, releaseSlotHold } from '../api';
import { mapBookingError } from '../errors';
import { useTurfResources, useInvalidateBookingQueries, useTurfSlots } from '../useBooking';
import type { MembershipPlan, TurfSlot } from '@/types/db';

const DATE_WINDOW = 14;

type HeldSlot = { slot: TurfSlot; holdId: string; expiresAt: number };

// Whole-hour duration of a slot, tolerant of a slot whose end_time wraps to
// "00:00:00" (midnight) — Turf hours run 5AM-midnight so this only ever
// matters for the very last slot of the day.
function slotDurationHours(slot: TurfSlot): number {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map((n) => parseInt(n, 10));
    return h * 60 + (m || 0);
  };
  const start = toMinutes(slot.start_time);
  let end = toMinutes(slot.end_time);
  if (end <= start) end += 24 * 60;
  return Math.round((end - start) / 60);
}

type PreviewLine = { label: string; hours: number; rate: number; subtotal: number };
type BookingPreview = { totalCredits: number; totalHours: number; lines: PreviewLine[] };

// Client-side preview only — a reasonable best-effort estimate using the
// plan's day/night rates and its own rolling-24h discount cap, priced hour
// by hour in chronological (start_time) order across the whole selection,
// mirroring how fn_confirm_multi_slot_booking prices the batch server-side.
// It does NOT query prior confirmed bookings in the rolling 24h window (that
// would need an extra round trip for a value the server recomputes
// authoritatively anyway) — so if the cap was already partly/fully consumed
// by earlier bookings today, this preview can look slightly more optimistic
// than the server's real number. That's fine per CLAUDE.md: previews are
// UX-only, the server is always authoritative for the final total.
function computeBookingPreview(
  sortedSlots: TurfSlot[],
  plan: MembershipPlan | undefined,
  isoDate: string
): BookingPreview | null {
  if (!plan || sortedSlots.length === 0) return null;

  const isWeekend = [0, 6].includes(new Date(`${isoDate}T00:00:00`).getDay());
  const standardNightRate = isWeekend
    ? plan.standard_night_weekend_rate_per_hour
    : plan.standard_night_weekday_rate_per_hour;

  let discountRemaining = plan.discounted_hours_cap_per_24h ?? Infinity;
  let totalCredits = 0;
  let totalHours = 0;
  const buckets = new Map<string, { hours: number; rate: number }>();

  const addHour = (label: string, rate: number) => {
    const existing = buckets.get(label);
    if (existing) existing.hours += 1;
    else buckets.set(label, { hours: 1, rate });
    totalCredits += rate;
    totalHours += 1;
  };

  for (const slot of sortedSlots) {
    const startHour = parseInt(slot.start_time.split(':')[0], 10);
    const duration = slotDurationHours(slot);
    for (let offset = 0; offset < duration; offset++) {
      const hour = (startHour + offset) % 24;
      const isDay = hour >= 5 && hour < 17;
      if (discountRemaining > 0) {
        discountRemaining -= 1;
        addHour(isDay ? 'Membership Day' : 'Membership Night', isDay ? plan.membership_day_rate_per_hour : plan.membership_night_rate_per_hour);
      } else {
        addHour(isDay ? 'Standard Day' : 'Standard Night', isDay ? plan.standard_day_rate_per_hour : standardNightRate);
      }
    }
  }

  const lines: PreviewLine[] = Array.from(buckets.entries()).map(([label, v]) => ({
    label,
    hours: v.hours,
    rate: v.rate,
    subtotal: v.hours * v.rate,
  }));

  return { totalCredits, totalHours, lines };
}

export function BookTurfScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { data: teams, isPending: teamsPending } = useMyTeams();
  const { activeTeamId, setActiveTeamId } = useActiveTeamStore();
  const { data: turfResources } = useTurfResources();
  const invalidateBooking = useInvalidateBookingQueries();

  const [selectedSport, setSelectedSport] = useState<'TURF' | 'PICKLEBALL'>('TURF');
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

  const resourcesForSport = useMemo(
    () => (turfResources ?? []).filter((r) => r.sport === selectedSport),
    [turfResources, selectedSport]
  );
  // Turf only ever has one resource — auto-select it so the flow feels
  // unchanged from before Pickleball existed. Pickleball has 4, so the user
  // picks explicitly (selectedResourceId stays null until they do).
  const turf = selectedSport === 'TURF'
    ? resourcesForSport[0]
    : resourcesForSport.find((r) => r.id === selectedResourceId);

  useEffect(() => {
    // eslint-disable-next-line
    setSelectedResourceId(null);
  }, [selectedSport]);

  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [heldSlots, setHeldSlots] = useState<Map<string, HeldSlot>>(new Map());
  const [mutatingSlotId, setMutatingSlotId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
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
  const { data: teamDetails } = useTeamDetails(activeTeam?.team.id);
  const plan = teamDetails?.membership?.plan;
  const activeMembers = (members ?? []).filter((m) => m.status === 'ACTIVE');

  // Derived, not stored: defaults to "just me" until the user explicitly
  // toggles someone, without needing an effect to seed state once the
  // session/member list finish loading.
  const effectiveParticipantIds =
    selectedParticipantIds.length > 0 ? selectedParticipantIds : session?.user.id ? [session.user.id] : [];

  const sortedHeldSlots = useMemo(
    () => Array.from(heldSlots.values()).sort((a, b) => a.slot.start_time.localeCompare(b.slot.start_time)),
    [heldSlots]
  );

  const preview = useMemo(
    () => computeBookingPreview(sortedHeldSlots.map((h) => h.slot), plan, selectedDate),
    [sortedHeldSlots, plan, selectedDate]
  );

  // Shared "earliest expiring" countdown across every currently-held slot —
  // simpler than a per-slot timer and equally useful, since all holds were
  // taken close together and expire on the same 1-minute window. Any hold
  // that actually expires is dropped from the map and surfaced, same spirit
  // as the old single-hold countdown effect.
  useEffect(() => {
    const tick = () => {
      if (heldSlots.size === 0) {
        setSecondsLeft(0);
        return;
      }
      const now = Date.now();
      const expiredIds: string[] = [];
      let earliest = Infinity;
      heldSlots.forEach((h, id) => {
        if (h.expiresAt <= now) expiredIds.push(id);
        else earliest = Math.min(earliest, h.expiresAt);
      });
      if (expiredIds.length > 0) {
        setHeldSlots((prev) => {
          const next = new Map(prev);
          expiredIds.forEach((id) => next.delete(id));
          return next;
        });
        Alert.alert(
          'Hold expired',
          expiredIds.length === 1
            ? 'Your slot hold expired. Please select it again.'
            : 'Some of your slot holds expired. Please reselect them.'
        );
      }
      setSecondsLeft(earliest === Infinity ? 0 : Math.max(0, Math.round((earliest - now) / 1000)));
    };
    tick();
    if (heldSlots.size === 0) return;
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [heldSlots]);

  const turfIdRef = useRef(turf?.id);
  useEffect(() => {
    if (turfIdRef.current && turfIdRef.current !== turf?.id && heldSlots.size > 0) {
      const toRelease = Array.from(heldSlots.values());
      setHeldSlots(new Map());
      Promise.all(toRelease.map((h) => releaseSlotHold(h.holdId).catch(() => undefined)));
    }
    turfIdRef.current = turf?.id;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turf?.id]);

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
          title="No Team yet"
          message="Create or join a Team before booking a Turf."
        />
      </SafeAreaView>
    );
  }

  const handleDateChange = async (iso: string) => {
    if (iso === selectedDate) return;
    setSelectedDate(iso);
    const toRelease = Array.from(heldSlots.values());
    setHeldSlots(new Map());
    // Best-effort: the date changed regardless of whether release succeeds
    // (e.g. a hold that already expired server-side) — never block the date
    // switch on this.
    await Promise.all(toRelease.map((h) => releaseSlotHold(h.holdId).catch(() => undefined)));
  };

  const handleToggleSlot = async (slot: TurfSlot) => {
    const existing = heldSlots.get(slot.id);
    if (existing) {
      // Tapping an already-selected (held-by-me) slot again deselects it.
      setMutatingSlotId(slot.id);
      try {
        await releaseSlotHold(existing.holdId);
      } catch {
        // Idempotent server-side for the common cases (already converted/
        // expired/released); still drop it locally below regardless so the
        // UI never gets stuck on a hold the user explicitly tried to let go.
      } finally {
        setHeldSlots((prev) => {
          const next = new Map(prev);
          next.delete(slot.id);
          return next;
        });
        setMutatingSlotId(null);
      }
      return;
    }

    if (slot.status !== 'AVAILABLE') return;
    setMutatingSlotId(slot.id);
    try {
      const result = await createSlotHold(slot.id, activeTeam.team.id);
      setHeldSlots((prev) =>
        new Map(prev).set(slot.id, {
          slot,
          holdId: result.hold_id,
          expiresAt: new Date(result.expires_at).getTime(),
        })
      );
    } catch (error) {
      const msg =
        error instanceof Error && error.message.includes('SLOT_UNAVAILABLE')
          ? 'That slot was just taken. Pick another.'
          : error instanceof Error
            ? error.message
            : 'Please try again.';
      Alert.alert('Could not hold slot', msg);
    } finally {
      setMutatingSlotId(null);
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
    if (heldSlots.size === 0 || effectiveParticipantIds.length === 0) return;
    setIsConfirming(true);
    try {
      const holdIds = sortedHeldSlots.map((h) => h.holdId);
      const bookingIds = await confirmMultiSlotBooking(holdIds, effectiveParticipantIds);
      invalidateBooking({ teamId: activeTeam.team.id, turfId: turf?.id });
      setHeldSlots(new Map());
      setSelectedParticipantIds([]);
      if (bookingIds.length > 1) {
        Alert.alert('Booking confirmed', `${bookingIds.length} slots were booked successfully.`);
      }
      if (bookingIds[0]) {
        router.push(`/(app)/booking/${bookingIds[0]}`);
      }
    } catch (error) {
      // Atomic server-side: a failure here means NONE of the selected slots
      // were booked, so the holds are likely still active — leave the
      // selection exactly as it was rather than clearing it, so the user can
      // retry without reselecting everything.
      Alert.alert('Booking failed', mapBookingError(error));
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
            <Text style={styles.teamPillLabel}>YOUR SELECTED TEAM</Text>
            <Text style={styles.teamPillValue}>{activeTeam.team.name}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Select Sport</Text>
        <View style={styles.sportRow}>
          {(['TURF', 'PICKLEBALL'] as const).map((sport) => (
            <Pressable
              key={sport}
              style={[styles.sportChip, selectedSport === sport && styles.sportChipSelected]}
              onPress={() => setSelectedSport(sport)}
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
            <Text style={styles.sectionLabel}>Select Court</Text>
            <View style={styles.sportRow}>
              {resourcesForSport.map((court) => (
                <Pressable
                  key={court.id}
                  style={[styles.sportChip, selectedResourceId === court.id && styles.sportChipSelected]}
                  onPress={() => setSelectedResourceId(court.id)}
                >
                  <Text style={[styles.sportChipText, selectedResourceId === court.id && styles.sportChipTextSelected]}>
                    {court.name.replace('Pickleball ', '')}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

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
                onPress={() => handleDateChange(iso)}
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
              const isSelected = heldSlots.has(slot.id);
              const isDisabled = slot.status !== 'AVAILABLE' && !isSelected;
              return (
                <Pressable
                  key={slot.id}
                  style={[
                    styles.slotChip,
                    isSelected && styles.slotChipSelected,
                    isDisabled && styles.slotChipDisabled,
                  ]}
                  disabled={isDisabled || mutatingSlotId === slot.id}
                  onPress={() => handleToggleSlot(slot)}
                >
                  {mutatingSlotId === slot.id ? (
                    <ActivityIndicator size="small" color={isSelected ? '#FFFFFF' : colors.primary} />
                  ) : (
                    <Text
                      style={[
                        styles.slotText,
                        isSelected && styles.slotTextSelected,
                        isDisabled && styles.slotTextDisabled,
                      ]}
                    >
                      {formatSlotTime(slot.start_time)}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {heldSlots.size > 0 && (
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
                  {m.team_role === 'HOST' && <Badge label="HOST" tone="host" />}
                  {m.team_role === 'CO_HOST' && <Badge label="CO-HOST" tone="coHost" />}
                  <Ionicons
                    name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={checked ? colors.primary : colors.border}
                    style={{ marginLeft: spacing.sm }}
                  />
                </Pressable>
              );
            })}
          </>
        )}

        {heldSlots.size > 0 && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Booking Summary</Text>
            <View style={styles.summaryRow}>
              <Ionicons name="location-outline" size={14} color={colors.textMuted} />
              <Text style={styles.summaryText}>{turf?.name ?? 'Thrill Mill Turf'}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
              <Text style={styles.summaryText}>{formatBookingDate(selectedDate)}</Text>
            </View>
            {sortedHeldSlots.map((h) => (
              <View style={styles.summaryRow} key={h.slot.id}>
                <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                <Text style={styles.summaryText}>
                  {formatSlotTime(h.slot.start_time)}–{formatSlotTime(h.slot.end_time)}
                </Text>
              </View>
            ))}

            <Text style={styles.hoursSelectedLabel}>
              {preview?.totalHours ?? sortedHeldSlots.length} Hour
              {(preview?.totalHours ?? sortedHeldSlots.length) === 1 ? '' : 's'} Selected
            </Text>

            {preview?.lines.map((line) => (
              <View style={styles.rateLine} key={line.label}>
                <Text style={styles.rateLineText}>
                  {line.hours} {line.label} Hr{line.hours === 1 ? '' : 's'} @ ₹{line.rate}/hr
                </Text>
                <Text style={styles.rateLineValue}>₹{line.subtotal.toLocaleString()}</Text>
              </View>
            ))}

            {preview && (
              <View style={styles.totalBox}>
                <Text style={styles.totalLabel}>Estimated Total (server-confirmed on submit)</Text>
                <Text style={styles.totalValue}>{Math.round(preview.totalCredits).toLocaleString()} CR</Text>
              </View>
            )}

            {preview && activeTeam.wallet && (
              <View style={styles.walletPreviewBox}>
                <View style={styles.walletPreviewRow}>
                  <Text style={styles.walletPreviewLabel}>Wallet Before</Text>
                  <Text style={styles.walletPreviewValue}>
                    {Math.round(activeTeam.wallet.available_credits).toLocaleString()} CR
                  </Text>
                </View>
                <View style={styles.walletPreviewRow}>
                  <Text style={styles.walletPreviewLabel}>Deduct</Text>
                  <Text style={[styles.walletPreviewValue, { color: colors.danger }]}>
                    -{Math.round(preview.totalCredits).toLocaleString()} CR
                  </Text>
                </View>
                <View style={styles.walletPreviewRow}>
                  <Text style={styles.walletPreviewLabel}>Wallet After</Text>
                  <Text style={styles.walletPreviewValue}>
                    {Math.max(0, Math.round(activeTeam.wallet.available_credits - preview.totalCredits)).toLocaleString()} CR
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {heldSlots.size > 0 && (
        <View style={styles.confirmBar}>
          <View style={styles.confirmTopRow}>
            <View>
              <Text style={styles.confirmLabel}>{sortedHeldSlots.length} SLOT{sortedHeldSlots.length === 1 ? '' : 'S'} HELD</Text>
              <Text style={styles.confirmMeta}>
                {preview?.totalHours ?? sortedHeldSlots.length} Hours · {effectiveParticipantIds.length} Players
              </Text>
            </View>
            <Text style={styles.confirmTimer}>
              <Ionicons name="time-outline" size={14} color="#FBBF24" /> {secondsLeft}s
            </Text>
          </View>
          <Button
            title="Confirm Booking"
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

  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  summaryText: { fontSize: 12, color: colors.textMuted },
  hoursSelectedLabel: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  rateLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  rateLineText: { fontSize: 12, color: colors.textMuted, flex: 1 },
  rateLineValue: { fontSize: 12, fontWeight: '700', color: colors.text },
  totalBox: { backgroundColor: '#F8FAFC', borderRadius: radii.sm, padding: spacing.md, marginTop: spacing.sm },
  totalLabel: { fontSize: 10, color: colors.textMuted },
  totalValue: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: 2 },
  walletPreviewBox: { marginTop: spacing.sm, gap: 4 },
  walletPreviewRow: { flexDirection: 'row', justifyContent: 'space-between' },
  walletPreviewLabel: { fontSize: 11, color: colors.textMuted },
  walletPreviewValue: { fontSize: 12, fontWeight: '700', color: colors.text },

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
