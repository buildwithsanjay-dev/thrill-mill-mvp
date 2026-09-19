import { useEffect } from 'react';
import { BackHandler, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedSuccess } from '@/components/AnimatedSuccess';
import { Button } from '@/components/Button';
import { colors, radii, spacing } from '@/constants/theme';
import { useCreateTeamWizard } from '@/stores/createTeamWizard';
import { buildInviteMessage } from '../invite';

// Shown after the last wizard step succeeds. Replaces the old "Team created!"
// system popup, and — because it is the wizard's terminal screen — is also
// what fixes the blank white screen users hit pressing Back afterwards: every
// exit here (button, hardware Back) first pops the whole wizard stack with
// dismissAll(), so no stale Create Team / Add Members screen is left beneath.
export function TeamCreatedSuccessScreen() {
  const router = useRouter();
  const { teamId, teamName, teamJoinCode, selectedMembers, reset } = useCreateTeamWizard();

  const leaveWizard = (target: 'home' | 'team') => {
    const id = teamId;
    // Go home FIRST (dismissTo pops the whole wizard stack back to the tabs)
    // and only clear the wizard's data afterwards. Clearing it immediately
    // made the still-mounted Create Team / Add Members screens see "no team"
    // and bounce back to Step 1 — the loop that was reported.
    router.dismissTo('/(app)/(tabs)');
    if (target === 'team' && id) {
      router.push(`/(app)/team/${id}`);
    }
    setTimeout(reset, 800);
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leaveWizard('home');
      return true;
    });
    return () => sub.remove();
    // leaveWizard only reads store values captured at first render, which is
    // all this terminal screen ever needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInvite = async () => {
    try {
      await Share.share({ message: buildInviteMessage(teamName, teamJoinCode) });
    } catch {
      // Share sheet dismissed — nothing to do.
    }
  };

  const memberCount = selectedMembers.length + 1;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.center}>
        <AnimatedSuccess />
        <Text style={styles.title}>Team created!</Text>
        <Text style={styles.subtitle}>
          {teamName} is set up with {memberCount} {memberCount === 1 ? 'member' : 'members'}. Your membership request is now
          with the club Admin — you can book slots as soon as they verify your payment and load your credits.
        </Text>

        {!!teamJoinCode && (
          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>TEAM ID · SHARE IT TO INVITE PLAYERS</Text>
            <Text style={styles.codeValue}>{teamJoinCode}</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Button title="Invite members" iconLeft="share-social-outline" onPress={handleInvite} />
        <Button title="View my team" variant="outline" onPress={() => leaveWizard('team')} />
        <Text style={styles.link} onPress={() => leaveWizard('home')}>
          Back to Home
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: colors.text, marginTop: spacing.md },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  codeCard: {
    marginTop: spacing.xl,
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  codeLabel: { fontSize: 10, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5 },
  codeValue: { fontSize: 24, fontWeight: '800', color: colors.primary, letterSpacing: 2, marginTop: 4 },
  footer: { gap: spacing.sm, paddingBottom: spacing.lg },
  link: { textAlign: 'center', fontSize: 13, fontWeight: '700', color: colors.textMuted, paddingVertical: spacing.sm },
});
