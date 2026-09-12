import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/profile/useProfile';
import { colors } from '@/constants/theme';

// Redirect gate: routes to (auth)/welcome, (auth)/profile-setup, or (app)
// based on session + onboarding state. This only decides *navigation* — it
// is never a substitute for server-side authorization checks.
export default function Index() {
  const { session, isLoading: isAuthLoading } = useAuth();
  const { data: profile, isLoading: isProfileLoading } = useProfile();

  if (isAuthLoading || (session && isProfileLoading)) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (!profile?.onboarded_at) {
    // Permissions screen is the first stop for anyone not yet onboarded —
    // it forwards to profile-setup itself once done/skipped. A user who
    // backgrounds the app mid-flow and reopens lands back here again (not
    // resumed mid-permissions-screen), which is fine: it's a priming UI
    // step, not a hard gate, and PermissionsScreen itself auto-forwards
    // instantly if both permissions are already granted by then.
    return <Redirect href="/(auth)/permissions" />;
  }

  // Same app, same login — the platform role alone decides which shell
  // renders. Never a separate app/build, per CLAUDE.md's User Roles note.
  if (profile.platform_role === 'ADMIN') {
    return <Redirect href="/(admin)" />;
  }

  return <Redirect href="/(app)" />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
});
