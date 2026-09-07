import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { Badge } from '@/components/Badge';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing } from '@/constants/theme';
import { useAllTeams } from '../useAdmin';
import type { AdminTeamRow } from '../api';

type Filter = 'ALL' | 'ACTIVE' | 'PENDING' | 'INACTIVE';

export function AdminTeamsScreen() {
  const router = useRouter();
  const { data: teams, isPending } = useAllTeams();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');

  const counts = useMemo(() => {
    const rows = teams ?? [];
    return {
      total: rows.length,
      active: rows.filter((r) => r.team.status === 'ACTIVE').length,
      pending: rows.filter((r) => r.membership && r.membership.status !== 'ACTIVE').length,
    };
  }, [teams]);

  const filtered = useMemo(() => {
    let rows = teams ?? [];
    if (filter === 'ACTIVE') rows = rows.filter((r) => r.team.status === 'ACTIVE');
    if (filter === 'PENDING') rows = rows.filter((r) => r.membership && r.membership.status !== 'ACTIVE');
    if (filter === 'INACTIVE') rows = rows.filter((r) => r.team.status === 'INACTIVE' || r.team.status === 'ARCHIVED');
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter((r) => r.team.name.toLowerCase().includes(q) || r.team.join_code.toLowerCase().includes(q));
    }
    return rows;
  }, [teams, filter, query]);

  const pendingRow = (teams ?? []).find((r) => r.membership && r.membership.status !== 'ACTIVE');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <AppHeader>
          <Text style={styles.title}>Networks</Text>
        </AppHeader>

        {isPending ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>TOTAL NETWORKS</Text>
              <Text style={styles.statValue}>{counts.total}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statLabel, { color: colors.primary }]}>ACTIVE</Text>
              <Text style={[styles.statValue, { color: colors.primary }]}>{counts.active}</Text>
            </View>
            <Pressable
              style={[styles.statCard, styles.statCardWarn]}
              onPress={() => setFilter('PENDING')}
            >
              <Text style={styles.statLabelWarn}>PENDING ACTIVATION</Text>
              <Text style={styles.statValueWarn}>{counts.pending}</Text>
            </Pressable>

            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search Network Name or Network ID"
                placeholderTextColor={colors.textMuted}
                value={query}
                onChangeText={setQuery}
              />
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
              {(['ALL', 'ACTIVE', 'PENDING', 'INACTIVE'] as Filter[]).map((f) => (
                <Pressable
                  key={f}
                  style={[styles.filterChip, filter === f && styles.filterChipActive]}
                  onPress={() => setFilter(f)}
                >
                  <Text style={[styles.filterChipLabel, filter === f && styles.filterChipLabelActive]}>
                    {f === 'ALL' ? 'All' : f === 'ACTIVE' ? 'Active' : f === 'PENDING' ? 'Pending Activation' : 'Inactive'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {pendingRow && filter === 'ALL' && (
              <>
                <View style={styles.sectionHeaderRow}>
                  <Ionicons name="alert-circle" size={15} color="#C2410C" />
                  <Text style={styles.sectionTitle}>Needs Your Attention</Text>
                </View>
                <Pressable
                  style={styles.attentionCard}
                  onPress={() => router.push(`/(admin)/team/${pendingRow.team.id}`)}
                >
                  <Badge label="AWAITING ACTIVATION" tone="pending" />
                  <Text style={styles.attentionId}>ID: {pendingRow.team.join_code}</Text>
                  <Text style={styles.attentionName}>{pendingRow.team.name}</Text>
                  <Text style={styles.attentionMeta}>
                    ₹{pendingRow.membership?.plan?.price_inr.toLocaleString()} Plan · {pendingRow.memberCount} Members
                  </Text>
                  <View style={styles.reviewButton}>
                    <Text style={styles.reviewButtonLabel}>Review</Text>
                    <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
                  </View>
                </Pressable>
              </>
            )}

            <Text style={styles.sectionTitle2}>All Networks</Text>
            {filtered.length === 0 ? (
              <EmptyState icon="git-network-outline" title="No networks found" />
            ) : (
              filtered.map((row) => <TeamRow key={row.team.id} row={row} onPress={() => router.push(`/(admin)/team/${row.team.id}`)} />)
            )}
          </>
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={() => router.push('/(admin)/team/create')}>
        <Ionicons name="add" size={18} color="#FFFFFF" />
        <Text style={styles.fabLabel}>Create Network</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function TeamRow({ row, onPress }: { row: AdminTeamRow; onPress: () => void }) {
  const isPending = row.membership && row.membership.status !== 'ACTIVE';
  return (
    <Pressable style={styles.teamCard} onPress={onPress}>
      <View style={styles.teamIcon}>
        <Ionicons name="shield" size={18} color={colors.textMuted} />
      </View>
      <View style={{ flex: 1, marginLeft: spacing.sm }}>
        <View style={styles.teamNameRow}>
          <Text style={styles.teamName}>{row.team.name}</Text>
          <Badge label={isPending ? 'PENDING' : row.team.status} tone={isPending ? 'pending' : 'active'} />
        </View>
        <Text style={styles.teamId}>ID: {row.team.join_code}</Text>
        <View style={styles.teamMetaRow}>
          <Text style={styles.teamMetaChip}>{row.memberCount} Members</Text>
          {row.membership?.plan && (
            <Text style={styles.teamMetaChip}>₹{row.membership.plan.price_inr.toLocaleString()} Plan</Text>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  scroll: { padding: spacing.lg, paddingBottom: 100 },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },

  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statCardWarn: { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' },
  statLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 },
  statLabelWarn: { fontSize: 11, fontWeight: '700', color: '#C2410C', letterSpacing: 0.3 },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.text, marginTop: 4 },
  statValueWarn: { fontSize: 24, fontWeight: '800', color: '#C2410C', marginTop: 4 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    height: 44,
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: 13, color: colors.text },

  filterRow: { flexDirection: 'row', marginTop: spacing.md },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  filterChipActive: { backgroundColor: colors.text, borderColor: colors.text },
  filterChipLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  filterChipLabelActive: { color: '#FFFFFF' },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  sectionTitle2: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },

  attentionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1.5,
    borderColor: '#F97316',
  },
  attentionId: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm },
  attentionName: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 2 },
  attentionMeta: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  reviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F97316',
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  reviewButtonLabel: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },

  teamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  teamIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  teamNameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  teamName: { fontSize: 14, fontWeight: '700', color: colors.text },
  teamId: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  teamMetaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  teamMetaChip: { fontSize: 11, color: colors.textMuted },

  fab: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
    left: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
  },
  fabLabel: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
