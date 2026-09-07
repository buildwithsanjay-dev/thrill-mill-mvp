import { useEffect, useRef } from 'react';
import { BackHandler, Platform, ToastAndroid } from 'react-native';
import { useRouter } from 'expo-router';

const EXIT_WINDOW_MS = 2000;

// Android's hardware back button, with nothing left in the navigation
// history to pop to (e.g. sitting on a tab reached by tapping the tab
// bar, not pushed via navigation), exits the app on a single press by
// default — jarring, and easy to trigger by accident. This intercepts
// that specific case only: if there's still somewhere to go back to,
// normal back navigation proceeds untouched; only when the router has
// nowhere left to go does this require a second press within 2 seconds,
// with a toast prompting for it.
export function ExitOnDoubleBack() {
  const router = useRouter();
  const lastPressRef = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (router.canGoBack()) {
        return false; // let default/normal back navigation happen
      }

      const now = Date.now();
      if (now - lastPressRef.current < EXIT_WINDOW_MS) {
        return false; // second press in time — let the OS exit the app
      }
      lastPressRef.current = now;
      ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      return true; // swallow this first press
    });

    return () => subscription.remove();
  }, [router]);

  return null;
}
