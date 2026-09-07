import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { colors, radii, spacing } from '@/constants/theme';
import { requestTeamMembership } from '@/features/membership/api';
import { useMembershipPlans } from '@/features/membership/useMembershipPlans';
import { useAdminTeamWizard } from '@/stores/adminTeamWizard';
import { useInvalidateAdminQueries } from '../../useAdmin';

export function NetworkCreatedScreen() {
  const router = useRouter();
  const invalidateAdmin = useInvalidateAdminQueries();
  const { teamName, teamId, teamJoinCode, members, planCode, reset } = useAdminTeamWizard();
  const { data: plans } = useMembershipPlans();
  const [isSubmitting, setIsSubmitting] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const submitted = useRef(false);

  const plan = plans?.find((p) => p.code === planCode);
  const host = members.find((m) => m.role === 'HOST');
  const coHost = members.find((m) => m.role === 'CO_HOST');

  useEffect(() => {
    if (submitted.current || !teamId || !planCode) return;
    submitted.current = true;
    requestTeamMembership({ teamId, planCode, hostPhone: host?.phone ?? '', coHostPhone: coHost?.phone ?? undefined })
      .then(() => invalidateAdmin())
      .catch((error) => setSubmitError(error instanceof Error ? error.message : 'Please try again.'))
      .finally(() => setIsSubmitting(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, planCode]);

  const goToActivate = () => {
    const id = teamId;
    reset();
    router.replace(`/(admin)/team/${id}/activate`);
  };
  const goToDetails = () => {
    const id = teamId;
    reset();
    router.replace(`/(admin)/team/${id}`);
  };
  const goToDashboard = () => {
    reset();
    router.replace('/(admin)/(tabs)');
  };

  if (isSubmitting) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.loadingText}>Submitting membership request…</Text>
      </SafeAreaView>
    );
  }

  if (submitError) {
    return (
      <SafeAreaView style={styles.loading}>
        <Ionicons name="alert-circle" size={32} color={colors.danger} />
        <Text style={styles.loadingText}>{submitError}</Text>
        <View style={{ marginTop: spacing.lg, width: '80%' }}>
          <Button title="Back to Dashboard" onPress={goToDashboard} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.checkIcon}>
          <Ionicons name="checkmark" size={32} color="#065F46" />
        </View>
        <Text style={styles.title}>TEAM CREATED{'\n'}SUCCESSFULLY</Text>
        <Text style={styles.subtitle}>The team has been created and is ready for membership activation.</Text>

        <View style={styles.card}>
          <View style={styles.cardTopRow}>
            <View style={styles.premiumTag}>
              <Text style={styles.premiumTagText}>NETWORK</Text>
            </View>
            <Ionicons name="people" size={18} color={colors.textMuted} />
          </View>
          <Text style={styles.teamName}>{teamName}</Text>
          <View style={styles.idRow}>
            <Ionicons name="finger-print-outline" size={14} color={colors.textMuted} />
            <Text style={styles.idText}>{teamJoinCode ?? '—'}</Text>
          </View>

          <View style={styles.divider} />
          <View style={styles.rowBetween}>
            <Text style={styles.rowLabel}>Members</Text>
            <Text style={styles.rowValue}>{members.length} Total</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.rowLabel}>Host</Text>
            <Text style={styles.rowValue}>{host?.full_name ?? '—'}</Text>
          </View>
          {coHost && (
            <View style={styles.rowBetween}>
              <Text style={styles.rowLabel}>Co-host</Text>
              <Text style={styles.rowValue}>{coHost.full_name}</Text>
            </View>
          )}
        </View>

        {plan && (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="ribbon" size={16} color={colors.text} />
              <Text style={styles.cardHeaderText}>Selected Membership</Text>
            </View>
            <View style={styles.planBox}>
              <Text style={styles.planName}>₹{plan.price_inr.toLocaleString()} Membership</Text>
              <Text style={styles.planCaption}>Exclusive Network Rates</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.rowLabel}>Network Rate</Text>
              <Text style={styles.rowValue}>₹{plan.membership_day_rate_per_hour}/hr</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.rowLabel}>Standard Rate</Text>
              <Text style={styles.rowValueStrike}>₹{plan.standard_day_rate_per_hour}/hr</Text>
            </View>
            {plan.discounted_hours_cap_per_24h && (
              <View style={styles.limitBox}>
                <Text style={styles.limitText}>Limit: {plan.discounted_hours_cap_per_24h}-hour rolling per 24-hour period.</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.pendingBanner}>
          <Ionicons name="time" size={16} color="#92400E" />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.pendingTitle}>PENDING ACTIVATION</Text>
            <Text style={styles.pendingBody}>Membership benefits are not active yet. Admin verification required.</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>What Happens Next</Text>
        <View style={styles.timeline}>
          <TimelineStep label="Team Created" done />
          <TimelineStep label="Payment Collected Externally" />
          <TimelineStep label="Membership Activated" />
          <TimelineStep label="Credits Loaded" />
          <TimelineStep label="Ready for Booking" last />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Activate Membership" onPress={goToActivate} />
        <View style={{ height: spacing.sm }} />
        <Button title="View Network Details" variant="outline" onPress={goToDetails} />
        <View style={{ height: spacing.sm }} />
        <Text style={styles.backLink} onPress={goToDashboard}>
          Back to Dashboard
        </Text>
      </View>
    </SafeAreaView>
  );
}

function TimelineStep({ label, done, last }: { label: string; done?: boolean; last?: boolean }) {
  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineDotCol}>
        <Ionicons
          name={done ? 'checkmark-circle' : 'ellipse-outline'}
          size={20}
          color={done ? colors.primary : colors.border}
        />
        {!last && <View style={styles.timelineLine} />}
      </View>
      <Text style={[styles.timelineLabel, done && styles.timelineLabelDone]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA', padding: spacing.xl },
  loadingText: { fontSize: 13, color: colors.textMuted, marginTop: spacing.md, textAlign: 'center' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl, alignItems: 'center' },

  checkIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#A7F3D0', alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, textAlign: 'center', marginTop: spacing.lg },
  subtitle: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm, paddingHorizontal: spacing.lg },

  card: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  premiumTag: { backgroundColor: '#ECFDF5', borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  premiumTagText: { fontSize: 10, fontWeight: '800', color: colors.primary },
  teamName: { fontSize: 18, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  idText: { fontSize: 12, color: colors.textMuted },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  rowLabel: { fontSize: 13, color: colors.textMuted },
  rowValue: { fontSize: 13, fontWeight: '700', color: colors.text },
  rowValueStrike: { fontSize: 13, fontWeight: '700', color: colors.textMuted, textDecorationLine: 'line-through' },

  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  cardHeaderText: { fontSize: 14, fontWeight: '800', color: colors.text },
  planBox: { backgroundColor: '#0F1729', borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
  planName: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
  planCaption: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  limitBox: { backgroundColor: '#F8FAFC', borderRadius: radii.sm, padding: spacing.sm, marginTop: spacing.sm },
  limitText: { fontSize: 11, color: colors.textMuted },

  pendingBanner: { flexDirection: 'row', width: '100%', backgroundColor: '#FEF3C7', borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.lg },
  pendingTitle: { fontSize: 12, fontWeight: '800', color: '#92400E' },
  pendingBody: { fontSize: 11, color: '#92400E', marginTop: 2, lineHeight: 16 },

  sectionTitle: { alignSelf: 'flex-start', fontSize: 15, fontWeight: '800', color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },
  timeline: { width: '100%' },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start' },
  timelineDotCol: { alignItems: 'center', width: 28 },
  timelineLine: { width: 1, height: 24, backgroundColor: colors.border },
  timelineLabel: { fontSize: 13, color: colors.textMuted, marginLeft: spacing.sm, marginTop: 1, marginBottom: spacing.sm },
  timelineLabelDone: { color: colors.text, fontWeight: '700' },

  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
  backLink: { textAlign: 'center', fontSize: 13, fontWeight: '600', color: colors.textMuted },
});
