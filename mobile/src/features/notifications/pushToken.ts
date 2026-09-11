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

// Requests permission, obtains this device's Expo push token, and saves it
// to the signed-in user's profiles row. Called once per sign-in (see
// AuthProvider) — best-effort and non-blocking: a user who denies the
// permission, or is on an emulator/simulator with no push capability,
// should never be blocked from using the rest of the app over this.
//
// Per CLAUDE.md's Push provider decision: this only ever talks to Expo's
// push token API, never Firebase/FCM directly — the server-side sender
// is what actually delivers to Expo's push endpoint later.
export async function registerForPushNotificationsAsync(): Promise<void> {
  if (!Device.isDevice) {
    // Physical-device-only per Expo's own push notification requirements —
    // emulators/simulators have no real push capability to register.
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    // User declined — respect it silently, nothing else in the app depends
    // on push notifications working.
    return;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return;

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return;

  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });

  await supabase.from('profiles').update({ expo_push_token: expoPushToken }).eq('id', userId);
}
