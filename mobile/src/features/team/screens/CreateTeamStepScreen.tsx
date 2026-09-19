import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { StepIndicator } from '@/components/StepIndicator';
import { TextField } from '@/components/TextField';
import { screenColors, radii, spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/profile/useProfile';
import { useCreateTeamWizard } from '@/stores/createTeamWizard';
import { validateTeamName } from '@/lib/validation';
import { abandonTeamCreation, createTeam, getTeamJoinCode, isTeamNameAvailable } from '../api';
import { useInvalidateTeamQueries } from '../useTeams';
import { showAlert } from '@/components/AppDialog';
import { friendlyError } from '@/lib/errors';

export function CreateTeamStepScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { data: profile } = useProfile();
  const invalidate = useInvalidateTeamQueries();
  const { teamName, teamId: existingTeamId, setTeamName, setTeamId, setTeamJoinCode, reset } = useCreateTeamWizard();
  const [isCreating, setIsCreating] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();

  const handleContinue = async () => {
    const problem = validateTeamName(teamName);
    setNameError(problem);
    if (problem) return;
    // Re-entering Step 1 (e.g. via the back button from Add Members)
    // already has a real, server-created Team from an earlier Continue
    // press in this same wizard session — call createTeam() again here and
    // that Team is silently orphaned while a duplicate is created next to
    // it. The eventual fix for "an incomplete Team must not persist" is
    // fn_cleanup_abandoned_team_creations (see supabase/migrations/
    // 20260913150000_abandon_incomplete_team_creation.sql), but not
    // creating the duplicate in the first place is strictly better.
    if (existingTeamId) {
      router.push('/(app)/team/create-members');
      return;
    }
    setIsCreating(true);
    try {
      // Team names are unique across the club — check first so the user sees
      // the reason right on the field instead of a failed request.
      if (!(await isTeamNameAvailable(teamName.trim()))) {
        setNameError('A team with this name already exists. Choose a different name.');
        return;
      }
      const teamId = await createTeam(teamName.trim().replace(/\s+/g, ' '));
      setTeamId(teamId);
      getTeamJoinCode(teamId).then(setTeamJoinCode).catch(() => undefined);
      invalidate();
      router.push('/(app)/team/create-members');
    } catch (error) {
      showAlert('Could not create Team', friendlyError(error));
    } finally {
      setIsCreating(false);
    }
  };

  const handleBack = () => {
    // Only reachable here once a Team already exists if the user went
    // forward past Step 1 and then backed all the way out — a genuine
    // abandon, not just "editing the name before continuing." Fire-and-
    // forget: fn_cleanup_abandoned_team_creations is the real guarantee
    // either way (see abandonTeamCreation's own comment).
    if (existingTeamId) {
      abandonTeamCreation(existingTeamId).catch(() => undefined);
    }
    reset();
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={handleBack} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={screenColors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Create Team</Text>
        <View style={{ width: 22 }} />
      </View>
      <Text style={styles.headerSubtitle}>Build your team and start playing together.</Text>

      <View style={styles.stepRow}>
        <StepIndicator steps={['TEAM', 'MEMBERS', 'MEMBERSHIP']} activeIndex={0} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionTitle}>Let&apos;s build your Team</Text>
        <Text style={styles.sectionSubtitle}>
          Your Team is your dedicated group for booking Turfs and managing games.
        </Text>

        <View style={styles.card}>
          <View style={styles.cardLabelRow}>
            <Ionicons name="ellipse-outline" size={16} color={screenColors.primaryLight} />
            <Text style={styles.cardLabel}>Team Name</Text>
          </View>
          <TextField
            label=""
            placeholder="e.g. Weekend Warriors"
            value={teamName}
            onChangeText={(v) => {
              setTeamName(v);
              if (nameError) setNameError(undefined);
            }}
            error={nameError}
            maxLength={40}
            style={styles.input}
            placeholderTextColor={screenColors.textMuted}
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
          <Ionicons name="information-circle" size={18} color={screenColors.primaryLight} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.infoTitle}>Build Your Playing Team</Text>
            <Text style={styles.infoBody}>
              Add your existing Thrill Mill members to your Team in the next step. A Team can
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
          <Ionicons name="shield-checkmark" size={18} color={screenColors.primaryLight} />
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
  container: { flex: 1, backgroundColor: screenColors.background, paddingHorizontal: spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: screenColors.text },
  headerSubtitle: { fontSize: 13, color: screenColors.textMuted, marginTop: spacing.xs, textAlign: 'center' },
  stepRow: { alignItems: 'center', marginTop: spacing.lg },
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.lg },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: screenColors.text },
  sectionSubtitle: { fontSize: 13, color: screenColors.textMuted, marginTop: spacing.xs, lineHeight: 19 },

  card: {
    backgroundColor: screenColors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: screenColors.border,
  },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  cardLabel: { fontSize: 13, fontWeight: '700', color: screenColors.text },
  input: {
    backgroundColor: screenColors.surfaceAlt,
    borderColor: screenColors.border,
    color: screenColors.text,
  },
  hint: { fontSize: 12, color: screenColors.textMuted, marginTop: spacing.sm },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: screenColors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  previewName: { fontSize: 14, fontWeight: '700', color: screenColors.text },
  previewMeta: { fontSize: 12, color: screenColors.primaryLight, marginTop: 2 },

  infoCard: {
    flexDirection: 'row',
    backgroundColor: screenColors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  infoTitle: { fontSize: 14, fontWeight: '700', color: screenColors.text },
  infoBody: { fontSize: 12, color: screenColors.textMuted, marginTop: 4, lineHeight: 18 },

  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: screenColors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  hostLabel: { fontSize: 10, fontWeight: '700', color: screenColors.textMuted, letterSpacing: 0.4 },
  hostName: { fontSize: 14, fontWeight: '700', color: screenColors.text, marginTop: 2 },
  hostYou: { color: screenColors.primaryLight, fontWeight: '600' },

  footer: { paddingBottom: spacing.lg, paddingTop: spacing.sm },
});
