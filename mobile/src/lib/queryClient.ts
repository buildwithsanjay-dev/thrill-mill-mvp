import { QueryClient, focusManager } from '@tanstack/react-query';
import { AppState, type AppStateStatus } from 'react-native';

// Server state (bookings, wallet balances, teams, membership status, etc.) always
// comes from Supabase via this client — the app never treats cached data as the
// source of truth for money/availability, only as a UI-responsiveness layer.
// Screens must always be prepared for the backend to disagree with what's cached
// (e.g. INSUFFICIENT_CREDITS on confirm even though the cached balance looked fine).
//
// refetchOnWindowFocus is a browser `window` concept — on its own it does
// nothing on React Native. Cross-device sync gap this closes: two phones
// (e.g. Admin's and a Member's) each hold an independent QueryClient with no
// shared invalidation channel, so when the Admin books/creates something, a
// Member's already-open app has no way to know until something refetches.
// Wiring focusManager to AppState (see registerQueryClientFocusManager
// below, called once near app startup) makes "foregrounding the app" (or
// returning to a screen that regains focus) trigger a refetch of stale
// queries, which is the minimum-viable fix for that gap.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

// Call once near app startup (see mobile/app/_layout.tsx). Returns an
// unsubscribe function for symmetry/testability, though the root layout
// never actually unmounts in practice.
export function registerQueryClientFocusManager(): () => void {
  const onAppStateChange = (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  };
  const subscription = AppState.addEventListener('change', onAppStateChange);
  return () => subscription.remove();
}
