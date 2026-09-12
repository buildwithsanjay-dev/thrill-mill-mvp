import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Foreground behavior: still show an alert/sound while the app is open,
// matching what a user expects from a push notification rather than it
// silently arriving with no visible effect.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Discriminated outcome instead of throwing — every caller can react to
// *why* registration didn't happen (silently, for a background best-effort
// call, or with real UI feedback, for a user-initiated one), without ever
// needing a try/catch of its own. `permission-denied`'s `canAskAgain` lets a
// caller distinguish "the OS will show its dialog again" from "the user
// already denied once and Android will never ask again for this app" — the
// real platform behavior the Profile screen's re-prompt row depends on.
export type PushRegistrationResult =
  | { status: 'registered' }
  | { status: 'not-a-device' }
  | { status: 'permission-denied'; canAskAgain: boolean }
  | { status: 'no-project-id' }
  | { status: 'not-signed-in' }
  | { status: 'error'; error: unknown };

// Requests permission, obtains this device's Expo push token, and saves it
// to the signed-in user's profiles row. Called from AuthProvider (silent,
// cold-start of an already-signed-in session) and from the onboarding
// Permissions screen / Profile screen's notification row (user-initiated,
// explains itself first) — never automatically on a fresh sign-in, so the
// OS permission dialog never ambushes someone before they've seen why.
//
// Per CLAUDE.md's Push provider decision: this only ever talks to Expo's
// push token API, never Firebase/FCM directly — the server-side sender
// is what actually delivers to Expo's push endpoint later.
export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  try {
    if (!Device.isDevice) {
      // Physical-device-only per Expo's own push notification requirements —
      // emulators/simulators have no real push capability to register.
      return { status: 'not-a-device' };
    }

    if (Platform.OS === 'android') {
      // HIGH (not DEFAULT) so a real push actually shows a heads-up banner —
      // DEFAULT only plays a sound with no peek, easy to miss for something
      // as immediate as "your booking is confirmed."
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let finalStatus = existing.status;
    let canAskAgain = existing.canAskAgain;
    if (finalStatus !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      finalStatus = requested.status;
      canAskAgain = requested.canAskAgain;
    }
    if (finalStatus !== 'granted') {
      return { status: 'permission-denied', canAskAgain };
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      console.warn('[push] no EAS projectId in app config — cannot register for push notifications');
      return { status: 'no-project-id' };
    }

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return { status: 'not-signed-in' };

    const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });

    const { error } = await supabase.from('profiles').update({ expo_push_token: expoPushToken }).eq('id', userId);
    if (error) return { status: 'error', error };

    return { status: 'registered' };
  } catch (error) {
    // Most likely cause on Android historically: the native build wasn't
    // compiled with google-services.json wired in (app.json's
    // android.googleServicesFile), so Expo's own Firebase-backed token
    // exchange had nothing to talk to. Logged here (still never thrown) so a
    // "no push notifications arriving" report is debuggable from device/
    // Metro logs even for a caller that doesn't otherwise show anything.
    console.warn('[push] registerForPushNotificationsAsync failed — push notifications will not work on this device:', error);
    return { status: 'error', error };
  }
}
