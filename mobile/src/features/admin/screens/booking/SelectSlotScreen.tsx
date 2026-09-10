import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { colors, radii, spacing } from '@/constants/theme';
import { confirmMultiSlotBooking, createSlotHold, releaseSlotHold } from '@/features/booking/api';
import { useTurfResources, useInvalidateBookingQueries, useTurfSlots } from '@/features/booking/useBooking';
import { useTeamDetails, useTeamMembers } from '@/features/team/useTeams';
import { useAdminBookingDraft } from '@/stores/adminBookingDraft';
import { addDaysIso, formatDayLabel, formatSlotTime, todayIso } from '@/utils/datetime';
import type { MembershipPlan, TurfSlot } from '@/types/db';

const DATE_WINDOW = 14;

type SelectedHold = { holdId: string; expiresAt: number };

// fn_confirm_multi_slot_booking (see supabase/migrations/
// 20260907140000_release_hold_and_multi_slot_booking.sql) generalizes the
// single-slot RPC to accept several ACTIVE holds at once, atomically, for
// the same Team on the same calendar day, and accepts a real participant
// list — closing both gaps this screen used to have (single-slot only,
// Host-only participant via fn_admin_confirm_booking_for_host with no
// picker at all). fn_admin_confirm_booking_for_host is left in place
// elsewhere but is no longer called from here.
export function SelectSlotScreen() {
  const router = useRouter();
  const { teamId, teamName, teamJoinCode, walletCredits } = useAdminBookingDraft();
  const { data: turfResources } = useTurfResources();
  const [selectedSport, setSelectedSport] = useState<'TURF' | 'PICKLEBALL'>('TURF');
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

  const resourcesForSport = useMemo(
    () => (turfResources ?? []).filter((r) => r.sport === selectedSport),
    [turfResources, selectedSport]
  );
  const turf = selectedSport === 'TURF'
    ? resourcesForSport[0]
    : resourcesForSport.find((r) => r.id === selectedResourceId);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset dependent state when sport selection changes
    setSelectedResourceId(null);
  }, [selectedSport]);

  const { data: teamDetails } = useTeamDetails(teamId ?? undefined);
  const { data: teamMembers } = useTeamMembers(teamId ?? undefined);
  const invalidateBooking = useInvalidateBookingQueries();

  const [selectedDate, setSelectedDate] = useState(todayIso());
  // Keyed by slot id. Each entry is its own ACTIVE hold — multiple slots can
  // be held concurrently, same-day only (falls out of slots being fetched
  // per selectedDate).
  const [selectedHolds, setSelectedHolds] = useState<Record<string, SelectedHold>>({});
  const [pendingSlotIds, setPendingSlotIds] = useState<Record<string, boolean>>({});
  // null = "no explicit choice yet, use the Host-only default" — computed
  // during render below rather than pushed in via a setState-in-an-effect,
  // so there's no risk of a stale/cascading render between the roster
  // loading and a default being applied.
  const [participantOverride, setParticipantOverride] = useState<string[] | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Mirrors selectedHolds for use in cleanup paths (unmount, back, date
  // change) where a stale closure would otherwise miss holds picked up
  // after the effect/handler was created.
  const selectedHoldsRef = useRef(selectedHolds);
  useEffect(() => {
    selectedHoldsRef.current = selectedHolds;
  }, [selectedHolds]);

  const { data: slots, isPending: slotsPending } = useTurfSlots(turf?.id, selectedDate);

  useEffect(() => {
    if (!teamId) router.replace('/(admin)/booking/create-team');
  }, [teamId, router]);

  // Live countdown for the earliest-expiring hold — 1-minute holds, per
  // product rule. Purely a UI nudge; the server is what actually enforces
  // expiry on confirm (HOLD_EXPIRED), not this timer.
  useEffect(() => {
    if (Object.keys(selectedHolds).length === 0) return;
    const interval = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [selectedHolds]);

  // Release every still-active hold on unmount (navigated away, back
  // button, etc.) — best-effort; fn_release_slot_hold is idempotent, and if
  // this never fires the 1-minute server-side expiry cleans it up anyway.
  useEffect(() => {
    return () => {
      Object.values(selectedHoldsRef.current).forEach((hold) => {
        releaseSlotHold(hold.holdId).catch(() => undefined);
      });
    };
  }, []);

  const dateOptions = useMemo(() => Array.from({ length: DATE_WINDOW }, (_, i) => addDaysIso(todayIso(), i)), []);
  const plan = teamDetails?.membership?.plan;
  const activeMembers = useMemo(() => (teamMembers ?? []).filter((m) => m.status === 'ACTIVE'), [teamMembers]);

  // Default: Host only, same starting point fn_admin_confirm_booking_for_host
  // used to hardcode server-side — except now it's a real, editable picker
  // (the actual gap being closed) instead of a silent default with no UI.
  const defaultParticipantIds = useMemo(() => {
    const host = activeMembers.find((m) => m.team_role === 'HOST');
    return host ? [host.user_id] : [];
  }, [activeMembers]);
  const participantIds = participantOverride ?? defaultParticipantIds;

  const selectedSlots = useMemo(() => {
    return (slots ?? [])
      .filter((s) => selectedHolds[s.id])
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [slots, selectedHolds]);

  const preview = useMemo(
    () => computeBookingPreview(selectedSlots, plan, selectedDate),
    [selectedSlots, plan, selectedDate]
  );

  const walletBefore = teamDetails?.wallet?.available_credits ?? walletCredits;
  const walletAfter = walletBefore - preview.totalCredits;

  const earliestExpiryMs = useMemo(() => {
    const values = Object.values(selectedHolds);
    if (values.length === 0) return null;
    return Math.min(...values.map((h) => h.expiresAt));
  }, [selectedHolds]);
  const secondsToExpiry = earliestExpiryMs !== null ? Math.max(0, Math.round((earliestExpiryMs - nowTick) / 1000)) : null;

  if (!teamId) return null;

  const releaseAllSelected = () => {
    const holds = selectedHoldsRef.current;
    setSelectedHolds({});
    Object.values(holds).forEach((hold) => {
      releaseSlotHold(hold.holdId).catch(() => undefined);
    });
  };

  const handleBack = () => {
    releaseAllSelected();
    router.back();
  };

  const handleSelectDate = (iso: string) => {
    if (iso === selectedDate) return;
    releaseAllSelected();
    setSelectedDate(iso);
  };

  const handleToggleSlot = async (slot: TurfSlot) => {
    if (pendingSlotIds[slot.id]) return;
    const existing = selectedHolds[slot.id];

    if (existing) {
      setPendingSlotIds((prev) => ({ ...prev, [slot.id]: true }));
      try {
        await releaseSlotHold(existing.holdId);
      } catch {
        // Idempotent server-side — even on network hiccup, drop it from
        // local selection so the UI doesn't get stuck showing "Selected".
      } finally {
        setSelectedHolds((prev) => {
          const next = { ...prev };
          delete next[slot.id];
          return next;
        });
        setPendingSlotIds((prev) => {
          const next = { ...prev };
          delete next[slot.id];
          return next;
        });
      }
      return;
    }

    if (slot.status !== 'AVAILABLE') return;
    setPendingSlotIds((prev) => ({ ...prev, [slot.id]: true }));
    try {
      const result = await createSlotHold(slot.id, teamId);
      setSelectedHolds((prev) => ({
        ...prev,
        [slot.id]: { holdId: result.hold_id, expiresAt: new Date(result.expires_at).getTime() },
      }));
    } catch (error) {
      Alert.alert('Could not hold slot', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setPendingSlotIds((prev) => {
        const next = { ...prev };
        delete next[slot.id];
        return next;
      });
    }
  };

  const toggleParticipant = (userId: string) => {
    const current = participantOverride ?? defaultParticipantIds;
    setParticipantOverride(current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  };

  const handleConfirm = async () => {
    if (selectedSlots.length === 0 || participantIds.length === 0) return;
    setIsConfirming(true);
    try {
      const holdIds = selectedSlots.map((s) => selectedHolds[s.id].holdId);
      await confirmMultiSlotBooking(holdIds, participantIds);
      setSelectedHolds({});
      invalidateBooking({ teamId, turfId: turf?.id });
      Alert.alert('Booking confirmed', `Booking created for ${teamName}.`);
      router.replace('/(admin)/(tabs)/bookings');
    } catch (error) {
      Alert.alert('Booking failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsConfirming(false);
    }
  };

  const canConfirm = selectedSlots.length > 0 && participantIds.length > 0 && !isConfirming;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Create Booking</Text>
          <Text style={styles.headerSubtitle}>Select Turf slots for the Team.</Text>
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
            <Text style={styles.changeLink} onPress={handleBack}>
              Change
            </Text>
          </View>
          <Text style={styles.teamId}>{teamJoinCode}</Text>
          <View style={styles.teamBottomRow}>
            <Text style={styles.teamMeta}>₹{Math.round(walletBefore).toLocaleString()} Credits</Text>
            {plan && <Text style={styles.teamMeta}>{plan.name}</Text>}
          </View>
        </View>

        <Text style={styles.sectionTitle}>Select Sport</Text>
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
            <Text style={styles.sectionTitle}>Select Court</Text>
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

        <Text style={styles.sectionTitle}>Select Date</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dateRow}>
          {dateOptions.map((iso) => {
            const { weekday, day } = formatDayLabel(iso);
            const isSelected = iso === selectedDate;
            return (
              <Pressable
                key={iso}
                style={[styles.dateChip, isSelected && styles.dateChipSelected]}
                onPress={() => handleSelectDate(iso)}
              >
                <Text style={[styles.dateWeekday, isSelected && styles.dateTextSelected]}>{weekday}</Text>
                <Text style={[styles.dateDay, isSelected && styles.dateTextSelected]}>{day}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Select Slots</Text>
          {selectedSlots.length > 0 && (
            <View style={styles.hoursBadge}>
              <Text style={styles.hoursBadgeText}>
                {selectedSlots.length} Hour{selectedSlots.length === 1 ? '' : 's'} Selected
              </Text>
            </View>
          )}
        </View>
        {slotsPending ? (
          <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} />
        ) : (
          <View style={styles.slotGrid}>
            {(slots ?? []).map((slot) => {
              const isSelected = !!selectedHolds[slot.id];
              const isPending = !!pendingSlotIds[slot.id];
              const isDisabled = (slot.status !== 'AVAILABLE' && !isSelected) || isPending;
              const statusLabel = isSelected ? 'Selected' : slot.status === 'AVAILABLE' ? 'Available' : 'Booked';
              return (
                <Pressable
                  key={slot.id}
                  style={[styles.slotChip, isSelected && styles.slotChipSelected, isDisabled && !isSelected && styles.slotChipDisabled]}
                  disabled={isDisabled}
                  onPress={() => handleToggleSlot(slot)}
                >
                  {isPending ? (
                    <ActivityIndicator size="small" color={isSelected ? '#FFFFFF' : colors.primary} />
                  ) : (
                    <>
                      <Text style={[styles.slotText, isSelected && styles.slotTextSelected]}>
                        {formatSlotTime(slot.start_time)}
                      </Text>
                      <Text
                        style={[
                          styles.slotStatusText,
                          isSelected && styles.slotStatusTextSelected,
                          !isSelected && slot.status !== 'AVAILABLE' && styles.slotStatusTextBooked,
                        ]}
                      >
                        {statusLabel}
                      </Text>
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {secondsToExpiry !== null && (
          <Text style={styles.expiryNote}>
            {secondsToExpiry > 0
              ? `Selected slots are held for ${secondsToExpiry}s — confirm before they expire.`
              : 'A hold may have expired — confirm to re-check, or reselect if it fails.'}
          </Text>
        )}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Select Participants</Text>
          <Text style={styles.counter}>{participantIds.length} Selected</Text>
        </View>
        <View style={styles.participantsCard}>
          {activeMembers.length === 0 && <Text style={styles.emptyText}>No active members on this Team yet.</Text>}
          {activeMembers.map((m) => {
            const checked = participantIds.includes(m.user_id);
            return (
              <Pressable key={m.id} style={styles.participantRow} onPress={() => toggleParticipant(m.user_id)}>
                <Avatar uri={m.profile?.avatar_url} name={m.profile?.full_name} size={32} />
                <Text style={styles.participantName}>{m.profile?.full_name ?? 'Member'}</Text>
                {m.team_role === 'HOST' && <Badge label="HOST" tone="host" />}
                {m.team_role === 'CO_HOST' && <Badge label="CO-HOST" tone="coHost" />}
                <Ionicons
                  name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={checked ? colors.primary : colors.border}
                  style={{ marginLeft: spacing.sm }}
                />
              </Pressable>
            );
          })}
        </View>

        {selectedSlots.length > 0 && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Booking Summary</Text>
            <View style={styles.summaryTopRow}>
              <View style={styles.summaryRow}>
                <Ionicons name="location-outline" size={14} color={colors.textMuted} />
                <Text style={styles.summaryText}>{turf?.name ?? 'Thrill Mill Turf'}</Text>
              </View>
              <Text style={styles.summaryDate}>{formatDayLabel(selectedDate).weekday} {formatDayLabel(selectedDate).day}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Ionicons name="time-outline" size={14} color={colors.textMuted} />
              <Text style={styles.summaryText}>
                {preview.rangeLabel} ({selectedSlots.length} Hr{selectedSlots.length === 1 ? '' : 's'})
              </Text>
            </View>

            <View style={styles.breakdownBox}>
              {preview.groups.map((g) => (
                <View key={g.key} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>
                    {g.count} {g.rateType === 'membership' ? 'Membership' : 'Standard'} Hr{g.count === 1 ? '' : 's'} @ ₹{g.rate}/hr
                  </Text>
                  <Text style={styles.breakdownValue}>₹{g.subtotal.toLocaleString()}</Text>
                </View>
              ))}
              <View style={styles.totalDivider} />
              <View style={styles.breakdownRow}>
                <Text style={styles.totalDebitLabel}>Total Debit</Text>
                <Text style={styles.totalDebitValue}>₹{preview.totalCredits.toLocaleString()} CR</Text>
              </View>
            </View>

            <View style={styles.walletFlowBox}>
              <View style={styles.walletFlowItem}>
                <Text style={styles.walletFlowLabel}>WALLET BEFORE</Text>
                <Text style={styles.walletFlowValue}>₹{Math.round(walletBefore).toLocaleString()}</Text>
              </View>
              <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
              <View style={styles.walletFlowItem}>
                <Text style={styles.walletFlowLabel}>DEDUCT</Text>
                <Text style={styles.walletFlowValueNegative}>-₹{preview.totalCredits.toLocaleString()}</Text>
              </View>
              <Ionicons name="arrow-forward" size={14} color={colors.textMuted} />
              <View style={styles.walletFlowItem}>
                <Text style={styles.walletFlowLabel}>WALLET AFTER</Text>
                <Text style={[styles.walletFlowValue, walletAfter < 0 && styles.walletFlowValueNegative]}>
                  ₹{Math.round(walletAfter).toLocaleString()}
                </Text>
              </View>
            </View>
            {walletAfter < 0 && (
              <Text style={styles.insufficientNote}>
                Estimated total exceeds the current wallet balance — the server will reject this on confirm.
              </Text>
            )}
            <Text style={styles.previewDisclaimer}>Estimated — final price and eligibility are confirmed by the server.</Text>
          </View>
        )}
      </ScrollView>

      {selectedSlots.length > 0 && (
        <View style={styles.footer}>
          <Button
            title={participantIds.length === 0 ? 'Select at least one participant' : 'Confirm Booking'}
            iconLeft="checkmark-circle-outline"
            onPress={handleConfirm}
            loading={isConfirming}
            disabled={!canConfirm}
          />
        </View>
      )}
    </SafeAreaView>
  );
}

type PreviewGroup = {
  key: string;
  rateType: 'membership' | 'standard';
  isDay: boolean;
  rate: number;
  count: number;
  subtotal: number;
};

type BookingPreview = {
  groups: PreviewGroup[];
  totalCredits: number;
  rangeLabel: string;
};

// Client-side preview only, per CLAUDE.md — the server (fn_confirm_multi_slot_booking)
// always recomputes price authoritatively. This deliberately does NOT try to
// account for the Team's discounted-hour usage from *other, already-confirmed*
// bookings in the rolling 24h window (that requires a DB query the server
// already does) — it applies the discount cap only across the hours selected
// in this draft, which is a reasonable best-effort estimate, not a promise.
function computeBookingPreview(
  sortedSlots: TurfSlot[],
  plan: MembershipPlan | undefined,
  isoDate: string
): BookingPreview {
  if (!plan || sortedSlots.length === 0) {
    return { groups: [], totalCredits: 0, rangeLabel: '' };
  }

  const isWeekend = [0, 6].includes(new Date(`${isoDate}T00:00:00`).getDay());
  const standardNightRate = isWeekend
    ? plan.standard_night_weekend_rate_per_hour
    : plan.standard_night_weekday_rate_per_hour;

  let remaining = plan.discounted_hours_cap_per_24h ?? Number.POSITIVE_INFINITY;
  const groups = new Map<string, PreviewGroup>();
  let totalCredits = 0;

  for (const slot of sortedSlots) {
    const startHour = parseInt(slot.start_time.split(':')[0] ?? '0', 10);
    const isDay = startHour >= 5 && startHour < 17;
    const useMembershipRate = remaining > 0;
    if (useMembershipRate) remaining -= 1;
    const rateType: 'membership' | 'standard' = useMembershipRate ? 'membership' : 'standard';
    const rate = useMembershipRate
      ? isDay
        ? plan.membership_day_rate_per_hour
        : plan.membership_night_rate_per_hour
      : isDay
        ? plan.standard_day_rate_per_hour
        : standardNightRate;

    totalCredits += rate;
    const key = `${rateType}-${isDay ? 'day' : 'night'}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      existing.subtotal += rate;
    } else {
      groups.set(key, { key, rateType, isDay, rate, count: 1, subtotal: rate });
    }
  }

  // Contiguous-run range label, e.g. "8:00 PM – 10:00 PM" or, for a
  // non-adjacent selection, "8:00 PM – 9:00 PM, 11:00 PM – 12:00 AM".
  const runs: { start: string; end: string }[] = [];
  for (const slot of sortedSlots) {
    const last = runs[runs.length - 1];
    if (last && last.end === slot.start_time) {
      last.end = slot.end_time;
    } else {
      runs.push({ start: slot.start_time, end: slot.end_time });
    }
  }
  const rangeLabel = runs.map((r) => `${formatSlotTime(r.start)} – ${formatSlotTime(r.end)}`).join(', ');

  return { groups: Array.from(groups.values()), totalCredits, rangeLabel };
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
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  counter: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  dateRow: { flexDirection: 'row' },
  dateChip: { width: 56, height: 60, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm, backgroundColor: '#FFFFFF' },
  dateChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  dateWeekday: { fontSize: 10, fontWeight: '700', color: colors.textMuted },
  dateDay: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 2 },
  dateTextSelected: { color: '#FFFFFF' },

  hoursBadge: { backgroundColor: '#ECFDF5', borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  hoursBadgeText: { fontSize: 11, fontWeight: '800', color: colors.primary },

  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  slotChip: { width: '31%', paddingVertical: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: '#FFFFFF' },
  slotChipSelected: { backgroundColor: colors.text, borderColor: colors.text },
  slotChipDisabled: { backgroundColor: '#F1F5F9', borderColor: '#F1F5F9' },
  slotText: { fontSize: 13, fontWeight: '700', color: colors.text },
  slotTextSelected: { color: '#FFFFFF' },
  slotStatusText: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  slotStatusTextSelected: { color: '#A7F3D0' },
  slotStatusTextBooked: { color: colors.danger },

  expiryNote: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm, fontStyle: 'italic' },

  participantsCard: { backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginTop: spacing.sm },
  participantRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  participantName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  emptyText: { fontSize: 13, color: colors.textMuted, paddingVertical: spacing.sm },

  summaryCard: { backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.xl, borderWidth: 1, borderColor: colors.border },
  summaryTitle: { fontSize: 14, fontWeight: '800', color: colors.text, marginBottom: spacing.sm },
  summaryTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  summaryDate: { fontSize: 12, fontWeight: '700', color: colors.text },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  summaryText: { fontSize: 12, color: colors.textMuted },

  breakdownBox: { backgroundColor: '#F8FAFC', borderRadius: radii.sm, padding: spacing.md, marginTop: spacing.md },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  breakdownLabel: { fontSize: 12, color: colors.textMuted },
  breakdownValue: { fontSize: 12, fontWeight: '700', color: colors.text },
  totalDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  totalDebitLabel: { fontSize: 13, fontWeight: '800', color: colors.text },
  totalDebitValue: { fontSize: 13, fontWeight: '800', color: colors.text },

  walletFlowBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', borderRadius: radii.sm, padding: spacing.md, marginTop: spacing.sm },
  walletFlowItem: { flex: 1, alignItems: 'center' },
  walletFlowLabel: { fontSize: 9, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3, textAlign: 'center' },
  walletFlowValue: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 2 },
  walletFlowValueNegative: { fontSize: 13, fontWeight: '800', color: colors.danger, marginTop: 2 },

  insufficientNote: { fontSize: 11, color: colors.danger, marginTop: spacing.sm },
  previewDisclaimer: { fontSize: 10, color: colors.textMuted, marginTop: spacing.sm, fontStyle: 'italic', textAlign: 'center' },

  sportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
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

  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
});
