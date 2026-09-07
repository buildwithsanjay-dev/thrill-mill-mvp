import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ExitOnDoubleBack } from '../src/components/ExitOnDoubleBack';
import { queryClient, registerQueryClientFocusManager } from '../src/lib/queryClient';
import { AuthProvider } from '../src/features/auth/AuthProvider';

export default function RootLayout() {
  // Registered once at app startup: without this, TanStack Query's
  // `focusManager` never learns the app went to background/foreground on
  // React Native (that's a browser `window.onfocus` concept by default), so
  // `refetchOnWindowFocus` in queryClient.ts does nothing on its own. This
  // is what actually makes "Admin books something, Member reopens their
  // app" pick up the change without a full realtime subsystem.
  useEffect(() => registerQueryClientFocusManager(), []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          <ExitOnDoubleBack />
          <Stack screenOptions={{ headerShown: false }} />
        </QueryClientProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
