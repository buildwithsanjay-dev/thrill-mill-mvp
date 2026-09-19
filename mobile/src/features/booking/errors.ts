import { friendlyError } from '@/lib/errors';

// Kept as a named export so every booking screen's existing import keeps
// working; the actual code -> plain-language mapping now lives in
// src/lib/errors.ts so the whole app reports the same reason the same way.
export function mapBookingError(error: unknown): string {
  return friendlyError(error, 'Please try again.');
}
