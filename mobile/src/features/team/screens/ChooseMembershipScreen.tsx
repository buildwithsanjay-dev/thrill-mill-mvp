import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { StepIndicator } from '@/components/StepIndicator';
import { TextField } from '@/components/TextField';
import { darkColors, radii, spacing } from '@/constants/theme';
import { requestTeamMembership } from '@/features/membership/api';
import { useMembershipPlans } from '@/features/membership/useMembershipPlans';
import type { Profile } from '@/features/profile/api';
import { useProfile } from '@/features/profile/useProfile';
import { useCreateTeamWizard } from '@/stores/createTeamWizard';
import type { MembershipPlan } from '@/types/db';

export function ChooseMembershipScreen() {
  const router = useRouter();
  const { data: profile, isPending: profileLoading } = useProfile();
  const { data: plans, isPending: plansLoading } = useMembershipPlans();
  const { teamId } = useCreateTeamWizard();

  useEffect(() => {
    if (!teamId) router.replace('/(app)/team/create');
  }, [teamId, router]);

  if (!teamId) return null;

  if (profileLoading || plansLoading || !profile || !plans) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={darkColors.primaryLight} />
      </SafeAreaView>
    );
  }

  return <MembershipForm profile={profile} plans={plans} teamId={teamId} />;
}

function MembershipForm({
  profile,
  plans,
  teamId,
}: {
  profile: Profile;
  plans: MembershipPlan[];
  teamId: string;
}) {
  const router = useRouter();
  const { teamName, selectedMembers, planCode, setPlanCode, reset } = useCreateTeamWizard();
  const [hostPhone, setHostPhone] = useState(() => profile.phone?.replace(/^\+91/, '') ?? '');
  const [coHostPhone, setCoHostPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (plans.length > 0 && !planCode) {
      // Explorer (₹25,000, unlimited) pre-selected, matching the Figma default.
      const explorer = plans.find((p) => p.price_inr === 25000) ?? plans[0];
      setPlanCode(explorer.code);
    }
  }, [plans, planCode, setPlanCode]);

  const handleConfirm = async () => {
    if (!planCode) return;
    if (!hostPhone.trim()) {
      Alert.alert('Host phone required', 'The Admin needs a number to reach the Host for payment.');
      return;
    }
    setIsSubmitting(true);
    try {
      await requestTeamMembership({
        teamId,
        planCode,
        hostPhone: `+91${hostPhone.trim()}`,
        coHostPhone: coHostPhone.trim() ? `+91${coHostPhone.trim()}` : undefined,
      });
      // Navigate first, then reset the wizard store — this screen (and its
      // isSubmitting state) is about to unmount as part of that
      // navigation, so nothing here should touch local state afterward.
      // Goes to the Home dashboard (not Team Details) per explicit user
      // request — confirming membership should drop you back at the app's
      // home base, not one level deep into the new Team.
      router.replace('/(app)/(tabs)');
      reset();
      Alert.alert(
        'Team created!',
        'Your membership request has been submitted. A Thrill Mill Admin will contact you to collect and verify payment before credits are loaded.'
      );
    } catch (error) {
      Alert.alert('Could not submit request', error instanceof Error ? error.message : 'Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={darkColors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Choose Membership</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.stepRow}>
        <StepIndicator steps={['TEAM', 'MEMBERS', 'MEMBERSHIP']} activeIndex={2} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.sectionTitle}>Choose Your Team Plan</Text>
          <Text style={styles.sectionSubtitle}>
            Activate your Team membership and unlock Turf booking benefits.
          </Text>

          <View style={styles.teamCard}>
            <View style={styles.teamIcon}>
              <Ionicons name="people" size={18} color={darkColors.text} />
            </View>
            <View style={{ marginLeft: spacing.sm }}>
              <Text style={styles.teamName}>{teamName}</Text>
              <Text style={styles.teamMeta}>
                {selectedMembers.length + 1} Members · Host: You
              </Text>
            </View>
          </View>

          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              selected={planCode === plan.code}
              onSelect={() => setPlanCode(plan.code)}
            />
          ))}

          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={18} color={darkColors.primaryLight} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.infoTitle}>HOW MEMBERSHIP WORKS</Text>
              <Text style={styles.infoBody}>
                Membership and credits belong to the Team collectively. The Host will complete
                payment externally for Admin verification.
              </Text>
            </View>
          </View>

          <View style={styles.contactCard}>
            <Text style={styles.contactLabel}>Contact numbers for Admin verification</Text>
            <TextField
              label="Host phone"
              labelColor={darkColors.text}
              prefix="+91"
              placeholder="00000 00000"
              keyboardType="phone-pad"
              value={hostPhone}
              onChangeText={setHostPhone}
              style={styles.input}
              placeholderTextColor={darkColors.textMuted}
            />
            <View style={{ height: spacing.sm }} />
            <TextField
              label="Co-host phone (optional)"
              labelColor={darkColors.text}
              prefix="+91"
              placeholder="00000 00000"
              keyboardType="phone-pad"
              value={coHostPhone}
              onChangeText={setCoHostPhone}
              style={styles.input}
              placeholderTextColor={darkColors.textMuted}
            />
          </View>
        </ScrollView>

      <View style={styles.footer}>
        <Button
          title={isSubmitting ? 'Submitting…' : 'Confirm Team Creation'}
          onPress={handleConfirm}
          loading={isSubmitting}
          disabled={!planCode}
        />
        <Text style={styles.footerHint}>Payment will be verified by the Thrill Mill Admin.</Text>
      </View>
    </SafeAreaView>
  );
}

function PlanCard({
  plan,
  selected,
  onSelect,
}: {
  plan: MembershipPlan;
  selected: boolean;
  onSelect: () => void;
}) {
  const isExplorer = plan.discounted_hours_cap_per_24h === null;

  return (
    <Pressable style={[styles.planCard, selected && styles.planCardSelected]} onPress={onSelect}>
      {isExplorer && (
        <View style={styles.planBanner}>
          <Text style={styles.planBannerText}>UNLIMITED BOOKINGS</Text>
        </View>
      )}
      <View style={styles.planHeaderRow}>
        <View>
          <Text style={styles.planName}>{plan.name}</Text>
          <Text style={styles.planPrice}>₹{plan.price_inr.toLocaleString()}</Text>
        </View>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
        </View>
      </View>

      <PlanFeature text={`All Days 5AM–5PM: ₹${plan.membership_day_rate_per_hour}/hr`} />
      <PlanFeature text={`All Days 5PM–Midnight: ₹${plan.membership_night_rate_per_hour}/hr`} />
      <PlanFeature text="Credits shared across Turf & Pickleball" />
      <PlanFeature
        muted
        text={`Standard price: 5AM–5PM ₹${plan.standard_day_rate_per_hour}/hr · Weekday 5PM–Mid ₹${plan.standard_night_weekday_rate_per_hour}/hr · Weekend 5PM–Mid ₹${plan.standard_night_weekend_rate_per_hour}/hr`}
      />
      {plan.discounted_hours_cap_per_24h ? (
        <>
          <PlanFeature
            text={`Membership price for first ${plan.discounted_hours_cap_per_24h} hours in a rolling 24h window`}
          />
          <PlanFeature muted text="Standard price applies after that" />
        </>
      ) : (
        <PlanFeature text="No rolling 24-hour limit — every hour at membership rate" />
      )}
      <PlanFeature text="Includes Shared Wallet and Transparent Activity" />
    </Pressable>
  );
}

function PlanFeature({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <View style={styles.featureRow}>
      <Ionicons
        name={muted ? 'information-circle-outline' : 'checkmark-circle'}
        size={15}
        color={muted ? darkColors.textMuted : darkColors.primaryLight}
      />
      <Text style={[styles.featureText, muted && styles.featureTextMuted]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: darkColors.background, paddingHorizontal: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  headerTitle: { fontSize: 16, fontWeight: '800', color: darkColors.text },
  stepRow: { alignItems: 'center', marginTop: spacing.lg },
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.lg },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: darkColors.text, textAlign: 'center' },
  sectionSubtitle: {
    fontSize: 13,
    color: darkColors.textMuted,
    marginTop: spacing.xs,
    textAlign: 'center',
    lineHeight: 19,
  },

  teamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: darkColors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  teamIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: darkColors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamName: { fontSize: 14, fontWeight: '700', color: darkColors.text },
  teamMeta: { fontSize: 11, color: darkColors.textMuted, marginTop: 2 },

  planCard: {
    backgroundColor: darkColors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    borderWidth: 1.5,
    borderColor: darkColors.border,
    overflow: 'hidden',
  },
  planCardSelected: { borderColor: darkColors.primaryLight },
  planBanner: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: darkColors.primaryLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderBottomLeftRadius: radii.sm,
  },
  planBannerText: { fontSize: 10, fontWeight: '800', color: '#04211D' },
  planHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  planName: { fontSize: 15, fontWeight: '700', color: darkColors.text },
  planPrice: { fontSize: 24, fontWeight: '800', color: darkColors.text, marginTop: 2 },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: darkColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: { backgroundColor: darkColors.primaryLight, borderColor: darkColors.primaryLight },

  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs, marginTop: spacing.sm },
  featureText: { flex: 1, fontSize: 12.5, color: darkColors.text, lineHeight: 18 },
  featureTextMuted: { color: darkColors.textMuted },

  infoCard: {
    flexDirection: 'row',
    backgroundColor: darkColors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  infoTitle: { fontSize: 11, fontWeight: '700', color: darkColors.text, letterSpacing: 0.4 },
  infoBody: { fontSize: 12, color: darkColors.textMuted, marginTop: 4, lineHeight: 18 },

  contactCard: {
    backgroundColor: darkColors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  contactLabel: { fontSize: 12, fontWeight: '700', color: darkColors.text, marginBottom: spacing.sm },
  input: { backgroundColor: darkColors.surfaceAlt, borderColor: darkColors.border, color: darkColors.text },

  footer: { paddingBottom: spacing.lg, paddingTop: spacing.sm },
  footerHint: { fontSize: 11, color: darkColors.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
