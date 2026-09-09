import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';

// Guards the whole (app) group: if the session disappears (sign-out, token
// revoked) while the user is inside it, bounce back to sign-in. This is a
// navigation convenience only — every screen/query underneath still relies
// on RLS + RPC checks for actual data access, per CLAUDE.md.
export default function AppLayout() {
  const { session, isLoading } = useAuth();

  if (!isLoading && !session) {
    return <Redirect href="/(auth)/welcome" />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="team/create" />
      <Stack.Screen name="team/create-members" />
      <Stack.Screen name="team/create-membership" />
      <Stack.Screen name="team/join" />
      <Stack.Screen name="team/[id]" />
      <Stack.Screen name="booking/[id]" />
      <Stack.Screen name="wallet/[teamId]" />
    </Stack>
  );
}
