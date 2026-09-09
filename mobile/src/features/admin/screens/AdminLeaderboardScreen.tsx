import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing } from '@/constants/theme';
import { useAdminAuditLogFeed, useAdminTeamLeaderboard } from '../useAdmin';
import type { AuditLogFeedRow } from '../api';

type TeamRange = 'week' | 'month';
type DateRangePreset = 'all' | '7d' | '30d';

const TEAM_RANGES: { key: TeamRange; label: string }[] = [
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

// Known sensitive Admin actions the audit log ever records (see
// supabase/migrations — every one of these has a matching admin_audit_logs
// insert). Kept as a fixed list rather than derived from loaded rows so the
// "All Actions" filter is stable even before any of a given type exists.
const ACTION_OPTIONS = [
  'MEMBERSHIP_APPROVED',
  'CREDIT_ADJUSTMENT',
  'TEAM_ROLE_CHANGED',
  'TURF_SLOT_BLOCKED',
  'TURF_SLOT_UNBLOCKED',
  'BOOKING_CONFIRMED_BY_ADMIN',
  'BOOKING_CANCELLED_BY_ADMIN',
];

const DATE_PRESETS: { key: DateRangePreset; label: string }[] = [
  { key: 'all', label: 'All Time' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function toCsv(rows: AuditLogFeedRow[]): string {
  const header = ['Date', 'Admin', 'Action', 'Target', 'Reason'];
  // Guard against CSV/formula injection: a value starting with =, +, -, @, or
  // a tab/CR (Excel/Sheets formula triggers) gets a leading apostrophe so it
  // opens as inert text, never as an executed formula. `reason` in
  // particular is free-text admin input, so this isn't just theoretical.
  const escape = (v: string) => {
    const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = rows.map((r) =>
    [
      new Date(r.created_at).toLocaleString('en-IN'),
      r.admin_name,
      r.action,
      r.target_label ?? '',
      r.reason ?? '',
    ]
      .map((v) => escape(String(v)))
      .join(',')
  );
  return [header.map(escape).join(','), ...lines].join('\n');
}

export function AdminLeaderboardScreen() {
  const [teamRange, setTeamRange] = useState<TeamRange>('week');
  const [actionFilter, setActionFilter] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState<DateRangePreset>('all');

  const { data: leaderboard, isPending: leaderboardPending } = useAdminTeamLeaderboard(teamRange);

  const dateFrom = dateFilter === '7d' ? isoDaysAgo(6) : dateFilter === '30d' ? isoDaysAgo(29) : null;
  const { data: logs, isPending: logsPending } = useAdminAuditLogFeed(200, {
    action: actionFilter,
    dateFrom,
  });

  const visibleLogs = logs ?? [];

  const handleExport = async () => {
    if (visibleLogs.length === 0) return;
    const csv = toCsv(visibleLogs);
    try {
      await Share.share({
        title: 'Admin Audit Logs',
        message: csv,
      });
    } catch {
      // User-cancelled share sheets throw on some platforms — nothing to do.
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <AppHeader>
          <Text style={styles.title}>Leaderboard</Text>
        </AppHeader>
        <Text style={styles.tagline}>Team rankings and the full Admin audit trail.</Text>

        <Text style={styles.sectionTitle}>Team Leaderboard</Text>
        <Text style={styles.sectionSubtitle}>Ranked by Turf games completed — server-computed</Text>
        <View style={styles.chipRow}>
          {TEAM_RANGES.map((r) => (
            <Pressable
              key={r.key}
              style={[styles.chip, teamRange === r.key && styles.chipActive]}
              onPress={() => setTeamRange(r.key)}
            >
              <Text style={[styles.chipText, teamRange === r.key && styles.chipTextActive]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>

        {leaderboardPending ? (
          <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} />
        ) : !leaderboard || leaderboard.teams.length === 0 ? (
          <EmptyState icon="trophy-outline" title="No Teams yet" message="Rankings appear once Teams exist." />
        ) : (
          <View style={styles.leaderboardCard}>
            {leaderboard.teams.map((row) => (
              <View key={row.team_id} style={styles.leaderRow}>
                <View style={[styles.leaderRankBadge, row.rank <= 3 && styles.leaderRankBadgeTop]}>
                  <Text style={[styles.leaderRankText, row.rank <= 3 && styles.leaderRankTextTop]}>{row.rank}</Text>
                </View>
                <Text style={styles.leaderName} numberOfLines={1}>
                  {row.team_name}
                </Text>
                <Text style={styles.leaderValue}>
                  {row.games_played} {row.games_played === 1 ? 'game' : 'games'}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.sectionHeaderRow}>
          <View>
            <Text style={styles.sectionTitle}>Admin Logs</Text>
            <Text style={styles.sectionSubtitle}>Every sensitive Admin action, with actor and target</Text>
          </View>
          <Pressable
            style={[styles.exportButton, visibleLogs.length === 0 && styles.exportButtonDisabled]}
            onPress={handleExport}
            disabled={visibleLogs.length === 0}
          >
            <Ionicons name="share-outline" size={16} color={colors.white} />
            <Text style={styles.exportButtonText}>Export CSV</Text>
          </Pressable>
        </View>

        <Text style={styles.filterLabel}>Action</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <Pressable
            style={[styles.chip, actionFilter === null && styles.chipActive]}
            onPress={() => setActionFilter(null)}
          >
            <Text style={[styles.chipText, actionFilter === null && styles.chipTextActive]}>All Actions</Text>
          </Pressable>
          {ACTION_OPTIONS.map((a) => (
            <Pressable
              key={a}
              style={[styles.chip, actionFilter === a && styles.chipActive]}
              onPress={() => setActionFilter(a)}
            >
              <Text style={[styles.chipText, actionFilter === a && styles.chipTextActive]}>
                {a.replaceAll('_', ' ')}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.filterLabel}>Date Range</Text>
        <View style={styles.chipRow}>
          {DATE_PRESETS.map((d) => (
            <Pressable
              key={d.key}
              style={[styles.chip, dateFilter === d.key && styles.chipActive]}
              onPress={() => setDateFilter(d.key)}
            >
              <Text style={[styles.chipText, dateFilter === d.key && styles.chipTextActive]}>{d.label}</Text>
            </Pressable>
          ))}
        </View>

        {logsPending ? (
          <ActivityIndicator style={{ marginTop: spacing.lg }} color={colors.primary} />
        ) : visibleLogs.length === 0 ? (
          <EmptyState icon="document-text-outline" title="No matching activity" message="Try a different filter." />
        ) : (
          <View style={styles.logsCard}>
            {visibleLogs.map((log) => (
              <View key={log.id} style={styles.logRow}>
                <View style={styles.logTopRow}>
                  <Text style={styles.logAction}>{log.action.replaceAll('_', ' ')}</Text>
                  <Text style={styles.logTime}>
                    {new Date(log.created_at).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Text style={styles.logMeta}>
                  by <Text style={styles.logMetaStrong}>{log.admin_name}</Text>
                  {log.target_label ? (
                    <>
                      {' '}
                      on <Text style={styles.logMetaStrong}>{log.target_label}</Text>
                    </>
                  ) : null}
                </Text>
                {!!log.reason && <Text style={styles.logReason}>{log.reason}</Text>}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },
  tagline: { fontSize: 13, color: colors.textMuted, marginTop: -spacing.sm, marginBottom: spacing.md },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  sectionSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm, marginBottom: spacing.md },
  filterScroll: { marginTop: spacing.sm, marginBottom: spacing.md },
  filterLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginTop: spacing.sm, letterSpacing: 0.3 },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#FFFFFF',
    marginRight: spacing.xs,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  chipTextActive: { color: colors.white },

  leaderboardCard: { backgroundColor: '#FFFFFF', borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  leaderRankBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  leaderRankBadgeTop: { backgroundColor: '#FEF3C7' },
  leaderRankText: { fontSize: 12, fontWeight: '800', color: colors.textMuted },
  leaderRankTextTop: { color: '#92400E' },
  leaderName: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  leaderValue: { fontSize: 13, fontWeight: '700', color: colors.primary },

  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xl },

  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  exportButtonDisabled: { opacity: 0.4 },
  exportButtonText: { fontSize: 12, fontWeight: '700', color: colors.white },

  logsCard: { backgroundColor: '#FFFFFF', borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  logRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  logTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logAction: { fontSize: 13, fontWeight: '800', color: colors.text, textTransform: 'capitalize' },
  logTime: { fontSize: 11, color: colors.textMuted },
  logMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  logMetaStrong: { color: colors.text, fontWeight: '700' },
  logReason: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontStyle: 'italic' },
});
