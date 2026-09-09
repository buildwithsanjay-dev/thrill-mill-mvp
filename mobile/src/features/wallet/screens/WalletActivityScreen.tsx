import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { darkColors, radii, spacing } from '@/constants/theme';
import { useTeamDetails } from '@/features/team/useTeams';
import { useTeamWallet, useWalletLedger } from '../useWallet';
import type { WalletLedgerEntry } from '@/types/db';

type FilterTab = 'ALL' | 'ADDED' | 'USAGE';

const ENTRY_META: Record<
  WalletLedgerEntry['entry_type'],
  { icon: keyof typeof Ionicons.glyphMap; color: string; sign: '+' | '-' }
> = {
  MEMBERSHIP_CREDIT: { icon: 'add-circle', color: darkColors.success, sign: '+' },
  BOOKING_CONSUME: { icon: 'football', color: '#F97316', sign: '-' },
  BOOKING_REFUND: { icon: 'refresh-circle', color: darkColors.primaryLight, sign: '+' },
  ADMIN_ADJUSTMENT: { icon: 'construct', color: '#A78BFA', sign: '+' },
};

const ENTRY_TITLE: Record<WalletLedgerEntry['entry_type'], string> = {
  MEMBERSHIP_CREDIT: 'Membership Activated',
  BOOKING_CONSUME: 'Turf Booking',
  BOOKING_REFUND: 'Booking Cancelled',
  ADMIN_ADJUSTMENT: 'Admin Adjustment',
};

export function WalletActivityScreen() {
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const router = useRouter();
  const { data: team } = useTeamDetails(teamId);
  const { data: wallet, isPending: walletPending } = useTeamWallet(teamId);
  const { data: ledger, isPending: ledgerPending } = useWalletLedger(teamId);
  const [filter, setFilter] = useState<FilterTab>('ALL');

  const filtered = useMemo(() => {
    if (!ledger) return [];
    if (filter === 'ALL') return ledger;
    if (filter === 'ADDED') return ledger.filter((e) => e.amount > 0);
    return ledger.filter((e) => e.amount < 0);
  }, [ledger, filter]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={darkColors.text} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Wallet Activity</Text>
          <Text style={styles.headerSubtitle}>{team?.team.name ?? ''}</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.balanceCard}>
          <View style={styles.balanceLabelRow}>
            <Ionicons name="card" size={14} color={darkColors.primaryLight} />
            <Text style={styles.balanceLabel}>CURRENT TEAM BALANCE</Text>
          </View>
          {walletPending ? (
            <ActivityIndicator color={darkColors.primaryLight} style={{ marginTop: spacing.sm }} />
          ) : (
            <Text style={styles.balanceValue}>
              {Math.round(wallet?.available_credits ?? 0).toLocaleString()}{' '}
              <Text style={styles.balanceUnit}>Credits</Text>
            </Text>
          )}
          <View style={styles.balanceNoteRow}>
            <Ionicons name="people" size={13} color={darkColors.textMuted} />
            <Text style={styles.balanceNote}>Shared Team Wallet</Text>
          </View>
          <Text style={styles.balanceHint}>All Team credit activity is recorded here.</Text>
        </View>

        <View style={styles.tabRow}>
          {(['ALL', 'ADDED', 'USAGE'] as FilterTab[]).map((tab) => (
            <Pressable
              key={tab}
              style={[styles.tab, filter === tab && styles.tabActive]}
              onPress={() => setFilter(tab)}
            >
              <Text style={[styles.tabLabel, filter === tab && styles.tabLabelActive]}>
                {tab === 'ALL' ? 'All' : tab === 'ADDED' ? 'Credits Added' : 'Booking Usage'}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Credit Activity</Text>

        {ledgerPending ? (
          <ActivityIndicator color={darkColors.primaryLight} style={{ marginTop: spacing.lg }} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="receipt-outline" title="No activity yet" message="Credit changes will show up here." />
        ) : (
          <View style={styles.timeline}>
            {filtered.map((entry, index) => {
              const meta = ENTRY_META[entry.entry_type];
              return (
                <View key={entry.id} style={styles.timelineRow}>
                  <View style={styles.timelineIconCol}>
                    <View style={[styles.timelineIcon, { backgroundColor: `${meta.color}22` }]}>
                      <Ionicons name={meta.icon} size={16} color={meta.color} />
                    </View>
                    {index < filtered.length - 1 && <View style={styles.timelineLine} />}
                  </View>
                  <View style={styles.timelineCard}>
                    <View style={styles.timelineTopRow}>
                      <Text style={styles.timelineTitle}>{ENTRY_TITLE[entry.entry_type]}</Text>
                      <Text style={[styles.timelineAmount, { color: entry.amount >= 0 ? darkColors.primaryLight : '#F97316' }]}>
                        {entry.amount >= 0 ? '+' : ''}
                        {Math.round(entry.amount)} Credits
                      </Text>
                    </View>
                    {!!entry.reason && <Text style={styles.timelineReason}>{entry.reason}</Text>}
                    <Text style={styles.timelineDate}>
                      {new Date(entry.created_at).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: darkColors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: darkColors.text },
  headerSubtitle: { fontSize: 11, color: darkColors.textMuted, marginTop: 2 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },

  balanceCard: {
    backgroundColor: darkColors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  balanceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  balanceLabel: { fontSize: 11, fontWeight: '700', color: darkColors.primaryLight, letterSpacing: 0.4 },
  balanceValue: { fontSize: 28, fontWeight: '800', color: darkColors.text, marginTop: spacing.sm },
  balanceUnit: { fontSize: 14, fontWeight: '600', color: darkColors.textMuted },
  balanceNoteRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md },
  balanceNote: { fontSize: 12, fontWeight: '600', color: darkColors.text },
  balanceHint: { fontSize: 11, color: darkColors.textMuted, marginTop: 4 },

  tabRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: darkColors.surface,
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  tabActive: { backgroundColor: darkColors.primaryLight, borderColor: darkColors.primaryLight },
  tabLabel: { fontSize: 12, fontWeight: '700', color: darkColors.textMuted },
  tabLabelActive: { color: '#04211D' },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: darkColors.text, marginTop: spacing.xl, marginBottom: spacing.md },

  timeline: {},
  timelineRow: { flexDirection: 'row' },
  timelineIconCol: { alignItems: 'center', width: 40 },
  timelineIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  timelineLine: { flex: 1, width: 1, backgroundColor: darkColors.border, marginVertical: 4 },
  timelineCard: {
    flex: 1,
    backgroundColor: darkColors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  timelineTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  timelineTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: darkColors.text, marginRight: spacing.sm },
  timelineAmount: { fontSize: 13, fontWeight: '800' },
  timelineReason: { fontSize: 12, color: darkColors.textMuted, marginTop: 4 },
  timelineDate: { fontSize: 11, color: darkColors.textMuted, marginTop: spacing.sm },
});
