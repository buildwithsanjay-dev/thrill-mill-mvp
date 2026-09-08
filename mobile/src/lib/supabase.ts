import 'react-native-url-polyfill/auto';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// NOTE: these are the *public* client-side values (anon key), safe to ship in the
// bundle — RLS policies in Postgres are what actually enforce data access, never
// this client. Never put SUPABASE_SERVICE_ROLE_KEY here or anywhere client-side.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy mobile/.env.example to mobile/.env and fill in your Supabase project values.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Per Supabase's official React Native guidance: `autoRefreshToken: true`
// alone is not enough — its internal refresh timer keeps running (or gets
// suspended unpredictably) while the app is backgrounded, on Android in
// particular, and can miss the refresh window entirely. Without this, the
// access token silently expires while backgrounded and the very next
// request fails auth, which looks exactly like "the app signed me out on
// its own" even though no sign-out ever happened.
//
// This is a top-level side effect (module scope, not inside a component),
// so it must guard against running more than once. Without the guard,
// anything that causes this module to be re-evaluated while the JS engine
// instance is kept alive (e.g. a Metro Fast Refresh full-module reload of a
// non-component module) would register an additional listener on top of
// the previous one, each one independently calling startAutoRefresh /
// stopAutoRefresh on every foreground/background transition.
const globalWithFlag = globalThis as typeof globalThis & {
  __thrillmill_authAppStateListenerRegistered__?: boolean;
};
if (!globalWithFlag.__thrillmill_authAppStateListenerRegistered__) {
  globalWithFlag.__thrillmill_authAppStateListenerRegistered__ = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });
}
