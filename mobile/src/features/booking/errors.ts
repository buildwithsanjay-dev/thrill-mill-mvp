// Shared business-outcome-code -> friendly-message mapping for the booking
// feature. One definition so every screen that calls a booking RPC
// (BookTurfScreen's hold/confirm, ManageBookingScreen's modify/cancel)
// reports the same codes the same way, per CLAUDE.md's "structured
// business-outcome codes, never raw DB/server errors" API convention.
export function mapBookingError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('INSUFFICIENT_CREDITS')) return 'Not enough Network credits for this booking.';
  if (message.includes('HOLD_EXPIRED')) return 'One or more holds expired before confirming. Please reselect and try again.';
  if (message.includes('SLOTS_MUST_BE_SAME_DAY')) return 'All selected slots must be on the same day.';
  if (message.includes('SLOTS_MUST_BE_SAME_TEAM')) return 'Something went wrong — the selected slots did not all belong to this Network.';
  if (message.includes('SLOT_UNAVAILABLE')) return 'One of the selected slots is no longer available.';
  if (message.includes('PARTICIPANT_INVALID')) return 'One of the selected players is not an active Network member.';
  if (message.includes('MEMBERSHIP_INACTIVE')) return "This Network's membership is not active.";
  if (message.includes('NO_SLOTS_SELECTED')) return 'Select at least one slot first.';
  if (message.includes('NO_PARTICIPANTS')) return 'Select at least one player.';
  if (message.includes('PARTICIPANTS_LOCKED')) return 'This session has already started — participants can no longer be changed.';
  if (message.includes('CANCELLATION_NOT_ALLOWED')) return 'This booking can no longer be cancelled.';
  if (message.includes('NOT_FOUND')) return 'This booking could not be found.';
  if (message.includes('FORBIDDEN')) return 'You are not authorized to do this.';
  return message || 'Please try again.';
}
