import { useEffect } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { StepIndicator } from '@/components/StepIndicator';
import { colors, radii, spacing } from '@/constants/theme';
import { useMembershipPlans } from '@/features/membership/useMembershipPlans';
import { useAdminTeamWizard } from '@/stores/adminTeamWizard';
import type { MembershipPlan } from '@/types/db';

const STEPS = ['DETAILS', 'MEMBERS', 'ROLES', 'MEMBERSHIP', 'REVIEW'];

export function CreateSelectMembershipScreen() {
  const router = useRouter();
  const { teamName, teamId, members, planCode, setPlanCode } = useAdminTeamWizard();
  const { data: plans, isPending } = useMembershipPlans();

  const host = members.find((m) => m.role === 'HOST');

  useEffect(() => {
    if (plans && plans.length > 0 && !planCode) {
      setPlanCode(plans[0].code);
    }
  }, [plans, planCode, setPlanCode]);

  useEffect(() => {
    if (!teamId) router.replace('/(admin)/team/create');
  }, [teamId, router]);

  if (!teamId) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Thrill Mill</Text>
        <View style={{ width: 22 }} />
      </View>

      <Text style={styles.sectionTitle}>Select Membership</Text>
      <Text style={styles.sectionSubtitle}>Choose the membership plan for this Network.</Text>

      <View style={styles.stepMeta}>
        <Text style={styles.stepMetaLabel}>STEP 4 OF 5</Text>
        <Text style={styles.stepMetaValue}>MEMBERSHIP</Text>
      </View>
      <View style={styles.stepRow}>
        <StepIndicator steps={STEPS} activeIndex={3} />
      </View>

      {isPending ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.teamCard}>
            <Avatar name={teamName} size={40} />
            <View style={{ marginLeft: spacing.sm }}>
              <Text style={styles.teamName}>{teamName}</Text>
              <Text style={styles.teamMeta}>
                {members.length} Members · Host: {host?.full_name ?? '—'}
              </Text>
            </View>
          </View>

          <Text style={styles.chooseTitle}>Choose a Membership Plan</Text>
          <View style={styles.infoCard}>
            <Ionicons name="information-circle-outline" size={16} color={colors.text} />
            <Text style={styles.infoBody}>
              Payment collection is managed externally. Once you select a plan and complete the setup, the
              Admin will verify the offline payment before the Network becomes active.
            </Text>
          </View>

          {plans?.map((plan) => (
            <PlanCard key={plan.id} plan={plan} selected={planCode === plan.code} onSelect={() => setPlanCode(plan.code)} />
          ))}
        </ScrollView>
      )}

      <View style={styles.footer}>
        <Button
          title="Continue to Review"
          iconRight="arrow-forward"
          onPress={() => router.push('/(admin)/team/created')}
          disabled={!planCode}
        />
      </View>
    </SafeAreaView>
  );
}

function PlanCard({ plan, selected, onSelect }: { plan: MembershipPlan; selected: boolean; onSelect: () => void }) {
  const isPremium = plan.discounted_hours_cap_per_24h === null;
  return (
    <Pressable style={[styles.planCard, selected && styles.planCardSelected]} onPress={onSelect}>
      {isPremium && (
        <View style={styles.premiumBadge}>
          <Ionicons name="star" size={10} color="#FFFFFF" />
          <Text style={styles.premiumBadgeText}>PREMIUM</Text>
        </View>
      )}
      <View style={styles.planTopRow}>
        <View style={styles.tagChip}>
          <Ionicons name={isPremium ? 'infinite' : 'time'} size={11} color={colors.primary} />
          <Text style={styles.tagChipText}>{isPremium ? 'UNLIMITED ACCESS' : 'ROLLING 24-HOUR RULE'}</Text>
        </View>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected && <View style={styles.radioDot} />}
        </View>
      </View>
      <Text style={styles.planName}>₹{plan.price_inr.toLocaleString()} Membership</Text>
      <View style={styles.rateRow}>
        <View style={styles.rateBox}>
          <Text style={styles.rateLabel}>Standard Turf Price</Text>
          <Text style={styles.rateStrike}>₹{plan.standard_day_rate_per_hour}/hr</Text>
        </View>
        <View style={styles.rateBox}>
          <Text style={styles.rateLabel}>Membership Price</Text>
          <Text style={styles.rateValue}>₹{plan.membership_day_rate_per_hour}/hr</Text>
        </View>
      </View>
      <Text style={styles.planFooter}>
        {isPremium
          ? 'No 3-hour limitation. Unlimited access to membership pricing on all eligible Turfs.'
          : `Up to ${plan.discounted_hours_cap_per_24h} playing hours at membership pricing per 24h. Additional hours at normal price.`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.text, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  sectionSubtitle: { fontSize: 12, color: colors.textMuted, paddingHorizontal: spacing.lg, marginTop: 2 },
  stepMeta: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  stepMetaLabel: { fontSize: 11, fontWeight: '700', color: colors.primary, letterSpacing: 0.4 },
  stepMetaValue: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.4 },
  stepRow: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },

  teamCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  teamName: { fontSize: 14, fontWeight: '800', color: colors.text },
  teamMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  chooseTitle: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: spacing.xl },
  infoCard: { flexDirection: 'row', gap: spacing.sm, backgroundColor: '#EFF6FF', borderRadius: radii.md, padding: spacing.md, marginTop: spacing.sm },
  infoBody: { flex: 1, fontSize: 12, color: '#1E3A8A', lineHeight: 17 },

  planCard: { backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.lg, borderWidth: 1.5, borderColor: colors.border, overflow: 'hidden' },
  planCardSelected: { borderColor: colors.primary, backgroundColor: '#ECFDF5' },
  premiumBadge: { position: 'absolute', top: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#78350F', paddingHorizontal: spacing.sm, paddingVertical: 4, borderBottomLeftRadius: radii.sm },
  premiumBadgeText: { fontSize: 9, fontWeight: '800', color: '#FDE68A' },
  planTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tagChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0FDFA', paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radii.pill },
  tagChipText: { fontSize: 9, fontWeight: '800', color: colors.primary },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: colors.primary },
  planName: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: spacing.sm },
  rateRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  rateBox: { flex: 1 },
  rateLabel: { fontSize: 11, color: colors.textMuted },
  rateStrike: { fontSize: 14, fontWeight: '700', color: colors.textMuted, textDecorationLine: 'line-through', marginTop: 2 },
  rateValue: { fontSize: 14, fontWeight: '800', color: colors.primary, marginTop: 2 },
  planFooter: { fontSize: 11, color: colors.textMuted, marginTop: spacing.md, lineHeight: 16 },

  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
});
