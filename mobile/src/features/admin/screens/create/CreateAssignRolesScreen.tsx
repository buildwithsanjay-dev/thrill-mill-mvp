import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { StepIndicator } from '@/components/StepIndicator';
import { colors, radii, spacing } from '@/constants/theme';
import { useAdminTeamWizard } from '@/stores/adminTeamWizard';
import { adminSetTeamRole } from '../../api';

const STEPS = ['DETAILS', 'MEMBERS', 'ROLES', 'MEMBERSHIP', 'REVIEW'];

export function CreateAssignRolesScreen() {
  const router = useRouter();
  const { teamName, teamId, members, setMemberRole } = useAdminTeamWizard();
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) router.replace('/(admin)/team/create');
  }, [teamId, router]);

  if (!teamId) return null;

  const handleSetRole = async (userId: string, role: 'HOST' | 'CO_HOST') => {
    const current = members.find((m) => m.id === userId);
    const nextRole = current?.role === role ? 'MEMBER' : role;
    setBusyId(userId);
    try {
      await adminSetTeamRole(teamId, userId, nextRole);
      setMemberRole(userId, nextRole);
    } catch (error) {
      Alert.alert('Could not update role', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Assign Roles</Text>
        <View style={{ width: 22 }} />
      </View>
      <Text style={styles.headerSubtitle}>Choose who will manage this Team.</Text>

      <View style={styles.stepMeta}>
        <Text style={styles.stepMetaLabel}>STEP 3 OF 5</Text>
        <Text style={styles.stepMetaValue}>MEMBERSHIP</Text>
      </View>
      <View style={styles.stepRow}>
        <StepIndicator steps={STEPS} activeIndex={2} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.teamCard}>
          <View style={styles.teamIcon}>
            <Ionicons name="people" size={16} color="#FFFFFF" />
          </View>
          <View style={{ marginLeft: spacing.sm }}>
            <Text style={styles.teamName}>{teamName}</Text>
            <Text style={styles.teamMeta}>{members.length} Members Added</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={16} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.infoBody}>Hosts have full control over the Team, including settings and membership.</Text>
            <Text style={[styles.infoBody, { marginTop: spacing.sm }]}>
              Co-hosts can assist with organizing events and managing member requests.
            </Text>
          </View>
        </View>

        <View style={styles.gridHeaderRow}>
          <Text style={styles.gridHeaderTitle}>Assign Roles</Text>
          <Text style={styles.gridHeaderCol}>HOST</Text>
          <Text style={styles.gridHeaderCol}>CO-HOST</Text>
        </View>

        {members.length === 0 ? (
          <Text style={styles.emptyText}>No members added yet.</Text>
        ) : (
          members.map((m) => (
            <View key={m.id} style={styles.memberRow}>
              <Avatar uri={m.avatar_url} name={m.full_name} size={36} />
              <Text style={styles.memberName}>{m.full_name ?? 'Member'}</Text>
              <Pressable
                style={styles.radioCol}
                onPress={() => handleSetRole(m.id, 'HOST')}
                disabled={busyId === m.id}
              >
                <Ionicons
                  name={m.role === 'HOST' ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={m.role === 'HOST' ? colors.primary : colors.border}
                />
              </Pressable>
              <Pressable
                style={styles.radioCol}
                onPress={() => handleSetRole(m.id, 'CO_HOST')}
                disabled={busyId === m.id}
              >
                <Ionicons
                  name={m.role === 'CO_HOST' ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={m.role === 'CO_HOST' ? colors.primary : colors.border}
                />
              </Pressable>
            </View>
          ))
        )}
        {busyId && <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} />}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Continue to Membership"
          onPress={() => router.push('/(admin)/team/create-membership')}
          disabled={!members.some((m) => m.role === 'HOST')}
        />
        {!members.some((m) => m.role === 'HOST') && (
          <Text style={styles.footerWarning}>Assign a Host before continuing.</Text>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  headerSubtitle: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  stepMeta: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  stepMetaLabel: { fontSize: 11, fontWeight: '700', color: colors.primary, letterSpacing: 0.4 },
  stepMetaValue: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.4 },
  stepRow: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },

  teamCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  teamIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#0F1729', alignItems: 'center', justifyContent: 'center' },
  teamName: { fontSize: 14, fontWeight: '800', color: colors.text },
  teamMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },

  infoCard: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.lg },
  infoBody: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },

  gridHeaderRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.sm },
  gridHeaderTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.text },
  gridHeaderCol: { width: 44, fontSize: 10, fontWeight: '700', color: colors.textMuted, textAlign: 'center' },

  emptyText: { fontSize: 13, color: colors.textMuted },
  memberRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: radii.md, padding: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  memberName: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text, marginLeft: spacing.sm },
  radioCol: { width: 44, alignItems: 'center' },

  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
  footerWarning: { fontSize: 11, color: colors.danger, textAlign: 'center', marginTop: spacing.sm },
});
