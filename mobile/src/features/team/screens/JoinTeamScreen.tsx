import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, radii, spacing } from '@/constants/theme';
import { requestJoinTeam } from '../api';
import { useInvalidateTeamQueries } from '../useTeams';

export function JoinTeamScreen() {
  const router = useRouter();
  const invalidate = useInvalidateTeamQueries();
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleJoin = async () => {
    if (!code.trim()) {
      Alert.alert('Enter a code', 'Ask your Team Host for their Network ID.');
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await requestJoinTeam(code.trim());
      invalidate();
      Alert.alert(
        'Request sent',
        `Your request to join ${result.team_name} has been sent to the Host for approval.`
      );
      router.replace('/(app)/(tabs)/team');
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes('INVALID_JOIN_CODE')
          ? 'That Network ID was not found. Double-check the code and try again.'
          : error instanceof Error && error.message.includes('ALREADY_ON_TEAM')
            ? "You're already on this Network."
            : error instanceof Error && error.message.includes('TEAM_FULL')
              ? 'This Network already has the maximum of 10 members.'
              : 'Please try again.';
      Alert.alert('Could not join Network', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </Pressable>

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="git-network" size={28} color={colors.primary} />
        </View>
        <Text style={styles.title}>Join a Network</Text>
        <Text style={styles.subtitle}>
          Ask your Team Host for their Network ID (e.g. TM-NW-7429) and enter it below to request to
          join.
        </Text>

        <View style={styles.form}>
          <TextField
            label="Network ID"
            placeholder="TM-XXXXXX"
            autoCapitalize="characters"
            autoCorrect={false}
            value={code}
            onChangeText={setCode}
          />
        </View>

        <View style={styles.footer}>
          <Button title="Request to Join" iconRight="arrow-forward" onPress={handleJoin} loading={isSubmitting} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  backButton: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  content: { flex: 1, alignItems: 'center', paddingTop: spacing.xl },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: { fontSize: 22, fontWeight: '800', color: colors.text },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 19,
    paddingHorizontal: spacing.md,
  },
  form: { width: '100%', marginTop: spacing.xl },
  footer: { width: '100%', marginTop: spacing.xl },
});
