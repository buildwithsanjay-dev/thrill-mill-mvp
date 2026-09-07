import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ExitOnDoubleBack } from '../src/components/ExitOnDoubleBack';
import { queryClient } from '../src/lib/queryClient';
import { AuthProvider } from '../src/features/auth/AuthProvider';

export default function RootLayout() {
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
