import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';

import { colors, themedStyles } from '@/constants/theme';
import { createSessionFromUrl } from '@/features/auth/api';

// Google sign-in's redirectTo is `thrillmillclub://auth` (see auth/api.ts) —
// without a real route file at that exact path, Expo Router's own linking
// resolver (which intercepts every incoming deep link before anything else
// gets a chance to react) had nothing to match and showed its default
// "Unmatched Route" screen for a moment on every sign-in, even a successful
// one, before AuthProvider's separate Linking-listener safety net caught up
// and corrected things. This route makes that landing spot intentional:
// establish the session from whatever tokens are in the URL Expo Router
// just navigated to (reusing the same parsing auth/api.ts's own
// signInWithGoogle() call uses, which correctly handles Supabase's token
// delivery as either a query string or a URL fragment), then hand off to
// the root gate (app/index.tsx) to decide where to actually go — permissions
// screen, profile setup, or straight into the app.
export default function AuthCallback() {
  const router = useRouter();
  const url = Linking.useURL();

  useEffect(() => {
    (async () => {
      if (url) {
        await createSessionFromUrl(url).catch((error) =>
          console.warn('[auth] callback session exchange failed:', error)
        );
      }
      router.replace('/');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return (
    <View style={styles.container}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}

const styles = themedStyles(() => ({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
}));
