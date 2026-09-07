import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/AppHeader';
import { colors, radii, spacing } from '@/constants/theme';
import { useRecentAuditLog } from '../useAdmin';

// No Figma mockup exists for this tab specifically — the bottom nav on
// every admin screen names it "Management" but only Home's Quick Actions
// grid shows what belongs here. This screen surfaces those same tools as a
// standalone hub (useful once Quick Actions scrolls off Home), plus the
// full audit log Home's "View Full Log" link points to.
export function AdminManagementScreen() {
  const router = useRouter();
  const { data: auditLog, isPending } = useRecentAuditLog();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <AppHeader>
          <Text style={styles.title}>Management</Text>
        </AppHeader>

        <View style={styles.grid}>
          <ActionCard icon="git-network" label="Network Management" onPress={() => router.push('/(admin)/(tabs)/teams')} />
          <ActionCard icon="person-add" label="Membership Requests" onPress={() => router.push('/(admin)/(tabs)/teams')} />
          <ActionCard icon="calendar" label="Bookings Overview" onPress={() => router.push('/(admin)/(tabs)/bookings')} />
          <ActionCard icon="ban" label="Block Turf Slot" onPress={() => router.push('/(admin)/block-slot')} />
        </View>

        <Text style={styles.sectionTitle}>Full Activity Log</Text>
        {isPending ? (
          <ActivityIndicator color={colors.primary} />
        ) : !auditLog || auditLog.length === 0 ? (
          <Text style={styles.emptyText}>No admin activity yet.</Text>
        ) : (
          <View style={styles.logCard}>
            {auditLog.map((log) => (
              <View key={log.id} style={styles.logRow}>
                <Text style={styles.logAction}>{log.action.replaceAll('_', ' ')}</Text>
                {!!log.reason && <Text style={styles.logReason}>{log.reason}</Text>}
                <Text style={styles.logTime}>
                  {new Date(log.created_at).toLocaleString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionCard({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.cardIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <Text style={styles.cardLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },
  title: { fontSize: 19, fontWeight: '800', color: colors.text },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    width: '47%',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  cardLabel: { fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'center' },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },
  emptyText: { fontSize: 13, color: colors.textMuted },
  logCard: { backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  logRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  logAction: { fontSize: 13, fontWeight: '700', color: colors.text, textTransform: 'capitalize' },
  logReason: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  logTime: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
