import { QueryClient } from '@tanstack/react-query';

// Server state (bookings, wallet balances, teams, membership status, etc.) always
// comes from Supabase via this client — the app never treats cached data as the
// source of truth for money/availability, only as a UI-responsiveness layer.
// Screens must always be prepared for the backend to disagree with what's cached
// (e.g. INSUFFICIENT_CREDITS on confirm even though the cached balance looked fine).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
