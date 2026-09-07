import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { StepIndicator } from '@/components/StepIndicator';
import { TextField } from '@/components/TextField';
import { darkColors, radii, spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/profile/useProfile';
import { useCreateTeamWizard } from '@/stores/createTeamWizard';
import { createTeam, getTeamJoinCode } from '../api';
import { useInvalidateTeamQueries } from '../useTeams';

export function CreateTeamStepScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const invalidate = useInvalidateTeamQueries();
  const { teamName, setTeamName, setTeamId, setTeamJoinCode, reset } = useCreateTeamWizard();
  const [isCreating, setIsCreating] = useState(false);

  const handleContinue = async () => {
    if (!teamName.trim()) {
      Alert.alert('Team name required', 'Give your Network a name to continue.');
      return;
    }
    setIsCreating(true);
    try {
      const teamId = await createTeam(teamName.trim());
      setTeamId(teamId);
      getTeamJoinCode(teamId).then(setTeamJoinCode).catch(() => undefined);
      invalidate();
      router.push('/(app)/team/create-members');
    } catch (error) {
      Alert.alert('Could not create Network', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleBack = () => {
    reset();
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={darkColors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Create Network</Text>
        <View style={{ width: 22 }} />
      </View>
      <Text style={styles.headerSubtitle}>Build your team and start playing together.</Text>

      <View style={styles.stepRow}>
        <StepIndicator steps={['TEAM', 'MEMBERS', 'MEMBERSHIP']} activeIndex={0} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionTitle}>Let&apos;s build your Team</Text>
        <Text style={styles.sectionSubtitle}>
          Your Network is your dedicated group for booking Turfs and managing games.
        </Text>

        <View style={styles.card}>
          <View style={styles.cardLabelRow}>
            <Ionicons name="ellipse-outline" size={16} color={darkColors.primaryLight} />
            <Text style={styles.cardLabel}>Team Name</Text>
          </View>
          <TextField
            label=""
            placeholder="e.g. Weekend Warriors"
            value={teamName}
            onChangeText={setTeamName}
            style={styles.input}
            placeholderTextColor={darkColors.textMuted}
          />
          <Text style={styles.hint}>Choose a name your team will easily recognize.</Text>

          {teamName.trim().length > 0 && (
            <View style={styles.previewRow}>
              <Avatar name={teamName.trim()} size={36} />
              <View style={{ marginLeft: spacing.sm }}>
                <Text style={styles.previewName}>{teamName.trim()}</Text>
                <Text style={styles.previewMeta}>10 Members Max</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={18} color={darkColors.primaryLight} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.infoTitle}>Build Your Playing Team</Text>
            <Text style={styles.infoBody}>
              Add your existing Thrill Mill members to your Network in the next step. A Network can
              have up to 10 playing members for seamless booking.
            </Text>
          </View>
        </View>

        <View style={styles.hostRow}>
          <Avatar uri={profile?.avatar_url} name={profile?.full_name} size={36} />
          <View style={{ marginLeft: spacing.sm, flex: 1 }}>
            <Text style={styles.hostLabel}>TEAM HOST</Text>
            <Text style={styles.hostName}>
              {profile?.full_name ?? session?.user.email} <Text style={styles.hostYou}>(You)</Text>
            </Text>
          </View>
          <Ionicons name="shield-checkmark" size={18} color={darkColors.primaryLight} />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Continue to Add Members"
          iconRight="arrow-forward"
          onPress={handleContinue}
          loading={isCreating}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: darkColors.background, paddingHorizontal: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: darkColors.text },
  headerSubtitle: { fontSize: 13, color: darkColors.textMuted, marginTop: spacing.xs, textAlign: 'center' },
  stepRow: { alignItems: 'center', marginTop: spacing.lg },
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.lg },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: darkColors.text },
  sectionSubtitle: { fontSize: 13, color: darkColors.textMuted, marginTop: spacing.xs, lineHeight: 19 },

  card: {
    backgroundColor: darkColors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  cardLabel: { fontSize: 13, fontWeight: '700', color: darkColors.text },
  input: {
    backgroundColor: darkColors.surfaceAlt,
    borderColor: darkColors.border,
    color: darkColors.text,
  },
  hint: { fontSize: 12, color: darkColors.textMuted, marginTop: spacing.sm },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: darkColors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  previewName: { fontSize: 14, fontWeight: '700', color: darkColors.text },
  previewMeta: { fontSize: 12, color: darkColors.primaryLight, marginTop: 2 },

  infoCard: {
    flexDirection: 'row',
    backgroundColor: darkColors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  infoTitle: { fontSize: 14, fontWeight: '700', color: darkColors.text },
  infoBody: { fontSize: 12, color: darkColors.textMuted, marginTop: 4, lineHeight: 18 },

  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: darkColors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  hostLabel: { fontSize: 10, fontWeight: '700', color: darkColors.textMuted, letterSpacing: 0.4 },
  hostName: { fontSize: 14, fontWeight: '700', color: darkColors.text, marginTop: 2 },
  hostYou: { color: darkColors.primaryLight, fontWeight: '600' },

  footer: { paddingBottom: spacing.lg, paddingTop: spacing.sm },
});
