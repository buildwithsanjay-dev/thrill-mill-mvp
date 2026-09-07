import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { colors, radii, spacing } from '@/constants/theme';
import { useTeamDetails } from '@/features/team/useTeams';
import { activateMembership } from '../api';
import { useInvalidateAdminQueries } from '../useAdmin';

export function ActivateMembershipScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isPending, refetch } = useTeamDetails(id);
  const invalidateAdmin = useInvalidateAdminQueries();
  const [isVerified, setIsVerified] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  if (isPending || !data) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const { team, membership, members } = data;
  const plan = membership?.plan;
  const host = members.find((m) => m.team_role === 'HOST');

  if (!membership || !plan || !membership.payment_id) {
    return (
      <SafeAreaView style={styles.loading}>
        <Text style={{ color: colors.textMuted }}>No pending membership to activate.</Text>
      </SafeAreaView>
    );
  }

  const handleActivate = async () => {
    setIsActivating(true);
    try {
      await activateMembership(membership.payment_id!);
      invalidateAdmin();
      refetch();
      Alert.alert(
        'Membership activated',
        `${plan.credits_allocated.toLocaleString()} credits loaded to ${team.name}'s wallet.`
      );
      router.back();
    } catch (error) {
      Alert.alert('Could not activate', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Activate Membership</Text>
          <Text style={styles.headerSubtitle}>{team.name.toUpperCase()}</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{team.name}</Text>
          <Text style={styles.summaryId}>{team.join_code}</Text>
          <Text style={styles.summaryMeta}>
            {members.filter((m) => m.status === 'ACTIVE').length} Members · Host: {host?.profile?.full_name ?? '—'}
          </Text>
        </View>

        <Text style={styles.sectionLabel}>Host &amp; Co-Host Contact Number</Text>
        <View style={styles.contactRow}>
          <View style={styles.contactChip}>
            <Text style={styles.contactText}>{membership.host_phone ?? 'Not provided'}</Text>
          </View>
          {membership.co_host_phone && (
            <View style={styles.contactChip}>
              <Text style={styles.contactText}>{membership.co_host_phone}</Text>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="albums" size={16} color={colors.primary} />
            <Text style={styles.cardHeaderText}>Selected Membership</Text>
          </View>
          <View style={styles.planBox}>
            <Text style={styles.planLabel}>PLAN</Text>
            <Text style={styles.planName}>₹{plan.price_inr.toLocaleString()} Membership</Text>
          </View>
          <View style={styles.rateRow}>
            <View style={styles.rateBox}>
              <Text style={styles.rateLabel}>MEMBERSHIP PRICE</Text>
              <Text style={styles.rateValue}>₹{plan.membership_day_rate_per_hour}/hr</Text>
            </View>
            <View style={styles.rateBox}>
              <Text style={styles.rateLabel}>STANDARD PRICE</Text>
              <Text style={styles.rateValueStrike}>₹{plan.standard_day_rate_per_hour}/hr</Text>
            </View>
          </View>
          <View style={styles.ruleBox}>
            <Ionicons name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={styles.ruleText}>
              {plan.discounted_hours_cap_per_24h
                ? `Rule: First ${plan.discounted_hours_cap_per_24h} playing hours within a rolling 24-hour window receive membership pricing. Additional booked hours use standard pricing.`
                : 'Rule: No rolling 24-hour limit — every hour is charged at the membership rate.'}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="shield-checkmark" size={16} color={colors.text} />
            <Text style={styles.cardHeaderText}>Payment Verification</Text>
          </View>
          <Text style={styles.verifyBody}>Payment is collected and verified externally by the Thrill Mill Admin.</Text>
          <Pressable style={styles.checkboxRow} onPress={() => setIsVerified((v) => !v)}>
            <Ionicons
              name={isVerified ? 'checkbox' : 'square-outline'}
              size={22}
              color={isVerified ? colors.primary : colors.border}
            />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.checkboxTitle}>Payment Received and Verified</Text>
              <Text style={styles.checkboxBody}>Only confirm this after the membership payment has been successfully received externally.</Text>
            </View>
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Ionicons name="card" size={16} color={colors.text} />
            <Text style={styles.cardHeaderText}>Load Network Credits</Text>
          </View>
          <View style={styles.loadRow}>
            <Text style={styles.loadLabel}>Selected Membership</Text>
            <Text style={styles.loadValue}>₹{plan.price_inr.toLocaleString()} Plan</Text>
          </View>
          <View style={styles.loadRow}>
            <Text style={styles.loadLabel}>Credits to Load</Text>
            <Text style={styles.loadValueEmphasis}>{plan.credits_allocated.toLocaleString()}</Text>
          </View>
          <Text style={styles.loadHint}>
            Fixed per the {plan.name} plan — credits allocated are not editable per CLAUDE.md&apos;s pricing rules.
          </Text>
        </View>

        <View style={styles.summaryDark}>
          <Text style={styles.summaryDarkTitle}>Activation Summary</Text>
          <View style={styles.summaryDarkRow}>
            <Text style={styles.summaryDarkLabel}>NEW STATUS</Text>
            <Text style={styles.summaryDarkValueGreen}>● ACTIVE</Text>
          </View>
          <View style={styles.summaryDarkRow}>
            <Text style={styles.summaryDarkLabel}>WALLET LOAD</Text>
            <Text style={styles.summaryDarkValue}>{plan.credits_allocated.toLocaleString()} Credits</Text>
          </View>
          <View style={styles.summaryDarkRow}>
            <Text style={styles.summaryDarkLabel}>NETWORK</Text>
            <Text style={styles.summaryDarkValue}>{team.name}</Text>
          </View>
        </View>

        <View style={styles.warningCard}>
          <Ionicons name="warning" size={16} color="#C2410C" />
          <Text style={styles.warningText}>
            Membership activation and credit loading affect the Network wallet. Please review before confirming.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={isActivating ? 'Activating…' : 'Activate Membership & Load Credits'}
          iconLeft={isActivating ? undefined : 'flash'}
          onPress={handleActivate}
          loading={isActivating}
          disabled={!isVerified}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  headerSubtitle: { fontSize: 10, color: colors.textMuted, marginTop: 2 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },

  summaryCard: { backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  summaryTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  summaryId: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  summaryMeta: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },
  contactRow: { flexDirection: 'row', gap: spacing.sm },
  contactChip: { backgroundColor: '#FFFFFF', borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border },
  contactText: { fontSize: 13, fontWeight: '600', color: colors.text },

  card: { backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md },
  cardHeaderText: { fontSize: 14, fontWeight: '800', color: colors.text },

  planBox: { backgroundColor: '#0F1729', borderRadius: radii.md, padding: spacing.md },
  planLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.3 },
  planName: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginTop: 2 },

  rateRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  rateBox: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: radii.sm, padding: spacing.md },
  rateLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 },
  rateValue: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: 4 },
  rateValueStrike: { fontSize: 15, fontWeight: '800', color: colors.textMuted, marginTop: 4, textDecorationLine: 'line-through' },

  ruleBox: { flexDirection: 'row', gap: spacing.xs, backgroundColor: '#F8FAFC', borderRadius: radii.sm, padding: spacing.sm, marginTop: spacing.md },
  ruleText: { flex: 1, fontSize: 11, color: colors.textMuted, lineHeight: 16 },

  verifyBody: { fontSize: 12, color: colors.textMuted, marginBottom: spacing.md },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#F8FAFC', borderRadius: radii.md, padding: spacing.md },
  checkboxTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  checkboxBody: { fontSize: 11, color: colors.textMuted, marginTop: 2, lineHeight: 16 },

  loadRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  loadLabel: { fontSize: 12, color: colors.textMuted },
  loadValue: { fontSize: 12, fontWeight: '700', color: colors.text },
  loadValueEmphasis: { fontSize: 16, fontWeight: '800', color: colors.primary },
  loadHint: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm, fontStyle: 'italic' },

  summaryDark: { backgroundColor: '#0F1729', borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.lg },
  summaryDarkTitle: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', marginBottom: spacing.sm },
  summaryDarkRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  summaryDarkLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.3 },
  summaryDarkValue: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  summaryDarkValueGreen: { fontSize: 13, fontWeight: '700', color: '#5EEAD4' },

  warningCard: { flexDirection: 'row', gap: spacing.sm, backgroundColor: '#FFF7ED', borderRadius: radii.md, padding: spacing.md, marginTop: spacing.lg },
  warningText: { flex: 1, fontSize: 11, color: '#9A3412', lineHeight: 16 },

  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
});
