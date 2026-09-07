import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, Stack } from 'expo-router';

import { colors } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { useProfile } from '@/features/profile/useProfile';

// Mirrors (app)/_layout.tsx's guard shape, plus a platform_role check: this
// entire group is Admin-only. A non-admin who somehow lands here (stale
// deep link, role changed mid-session) bounces to the member app — never
// shown, never trusted client-side elsewhere, just a navigation guard.
export default function AdminLayout() {
  const { session, isLoading: authLoading } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();

  if (!authLoading && !session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  if (authLoading || profileLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (profile?.platform_role !== 'ADMIN') {
    return <Redirect href="/(app)" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="team/create" />
      <Stack.Screen name="team/create-members" />
      <Stack.Screen name="team/create-roles" />
      <Stack.Screen name="team/create-membership" />
      <Stack.Screen name="team/created" />
      <Stack.Screen name="team/[id]" />
      <Stack.Screen name="team/[id]/activate" />
      <Stack.Screen name="booking/create-team" />
      <Stack.Screen name="booking/create-slot" />
      <Stack.Screen name="block-slot" />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
