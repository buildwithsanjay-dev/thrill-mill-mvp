import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { StepIndicator } from '@/components/StepIndicator';
import { TextField } from '@/components/TextField';
import { colors, radii, spacing } from '@/constants/theme';
import { useAdminTeamWizard } from '@/stores/adminTeamWizard';
import { adminCreateTeam } from '../../api';
import { useInvalidateAdminQueries } from '../../useAdmin';
import { getTeamJoinCode } from '@/features/team/api';

const STEPS = ['DETAILS', 'MEMBERS', 'ROLES', 'MEMBERSHIP', 'REVIEW'];

export function CreateTeamDetailsScreen() {
  const router = useRouter();
  const invalidateAdmin = useInvalidateAdminQueries();
  const { teamName, setTeamName, setTeamId, setTeamJoinCode, reset } = useAdminTeamWizard();
  const [isCreating, setIsCreating] = useState(false);

  const handleBack = () => {
    reset();
    router.back();
  };

  const handleContinue = async () => {
    if (!teamName.trim()) {
      Alert.alert('Team name required', 'Give this Network a name to continue.');
      return;
    }
    setIsCreating(true);
    try {
      const teamId = await adminCreateTeam(teamName.trim());
      setTeamId(teamId);
      getTeamJoinCode(teamId).then(setTeamJoinCode).catch(() => undefined);
      invalidateAdmin();
      router.push('/(admin)/team/create-members');
    } catch (error) {
      Alert.alert('Could not create Network', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Create Team</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.stepMeta}>
        <Text style={styles.stepMetaLabel}>STEP 1 OF 5</Text>
        <Text style={styles.stepMetaValue}>MEMBERSHIP</Text>
      </View>
      <View style={styles.stepRow}>
        <StepIndicator steps={STEPS} activeIndex={0} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.infoCard}>
          <View style={styles.infoIcon}>
            <Ionicons name="people" size={18} color={colors.text} />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.infoTitle}>Start a New Network</Text>
            <Text style={styles.infoBody}>Create the Network first, then add members and select the membership plan.</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Team Details</Text>

        <View style={styles.imagePicker}>
          <Ionicons name="camera-outline" size={24} color={colors.textMuted} />
        </View>
        <Text style={styles.imageLabel}>Add Team Image</Text>
        <Text style={styles.imageOptional}>Optional</Text>

        <View style={{ marginTop: spacing.lg }}>
          <TextField label="Team Name" placeholder="e.g. Weekend Warriors" value={teamName} onChangeText={setTeamName} />
          <Text style={styles.hint}>Choose a name that represents the team or community.</Text>
        </View>

        <View style={styles.idRow}>
          <Ionicons name="finger-print-outline" size={16} color={colors.textMuted} />
          <View style={{ marginLeft: spacing.sm }}>
            <Text style={styles.idLabel}>Team ID</Text>
            <Text style={styles.idValue}>Generated automatically</Text>
          </View>
        </View>

        <View style={styles.assistCard}>
          <Ionicons name="information-circle" size={16} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.assistTitle}>Admin-Assisted Registration</Text>
            <Text style={styles.assistBody}>
              You are creating this Network on behalf of members. The Network will function the same as a
              member-created Network once setup is complete.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Continue to Add Members" iconRight="arrow-forward" onPress={handleContinue} loading={isCreating} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  stepMeta: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  stepMetaLabel: { fontSize: 11, fontWeight: '700', color: colors.primary, letterSpacing: 0.4 },
  stepMetaValue: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.4 },
  stepRow: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },

  infoCard: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.border },
  infoIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  infoTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  infoBody: { fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 17 },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.xl },

  imagePicker: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: spacing.lg,
    backgroundColor: '#FFFFFF',
  },
  imageLabel: { fontSize: 13, fontWeight: '700', color: colors.text, textAlign: 'center', marginTop: spacing.sm },
  imageOptional: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },

  hint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },

  idRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.lg },
  idLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  idValue: { fontSize: 12, color: colors.textMuted, marginTop: 2 },

  assistCard: { flexDirection: 'row', backgroundColor: '#ECFDF5', borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.xl },
  assistTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  assistBody: { fontSize: 12, color: '#065F46', marginTop: 2, lineHeight: 17 },

  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
});
