import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DialogHost } from '../src/components/AppDialog';
import { ExitOnDoubleBack } from '../src/components/ExitOnDoubleBack';
import { queryClient, registerQueryClientFocusManager } from '../src/lib/queryClient';
import { AuthProvider } from '../src/features/auth/AuthProvider';
import { resolveNotificationRoute, type NotificationData } from '../src/features/notifications/api';

// Handles a tap on the actual OS push notification (as opposed to tapping
// its in-app equivalent in the Notifications list, handled separately in
// NotificationsScreen.tsx) — two cases, both needed:
//  - the app was already alive (foreground or backgrounded): the response
//    listener fires directly.
//  - the tap itself cold-started the app: the listener above never sees it
//    (it wasn't registered in time), so getLastNotificationResponseAsync()
//    is checked once on mount to catch that case too.
// Shares resolveNotificationRoute with NotificationsScreen.tsx so tapping
// either the real push or its in-app row lands on the same screen.
function useNotificationTapNavigation() {
  const router = useRouter();

  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as NotificationData;
      Notifications.clearLastNotificationResponseAsync();
      const route = resolveNotificationRoute(data);
      if (route) router.push(route);
    });

    // A push arrived while the app is open: refresh the bell list/red dot now.
    const received = Notifications.addNotificationReceivedListener(() => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as NotificationData;
      const route = resolveNotificationRoute(data);
      if (route) router.push(route);
    });
    return () => {
      subscription.remove();
      received.remove();
    };
  }, [router]);
}

export default function RootLayout() {
  // Registered once at app startup: without this, TanStack Query's
  // `focusManager` never learns the app went to background/foreground on
  // React Native (that's a browser `window.onfocus` concept by default), so
  // `refetchOnWindowFocus` in queryClient.ts does nothing on its own. This
  // is what actually makes "Admin books something, Member reopens their
  // app" pick up the change without a full realtime subsystem.
  useEffect(() => registerQueryClientFocusManager(), []);
  useNotificationTapNavigation();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="auto" />
          <ExitOnDoubleBack />
          <Stack screenOptions={{ headerShown: false }} />
          <DialogHost />
        </QueryClientProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
