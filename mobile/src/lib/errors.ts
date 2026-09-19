// One place that turns whatever a Supabase/RPC/network call threw into a
// sentence a club member can act on. The backend deliberately raises
// structured business codes (CLAUDE.md's API Conventions) — never raw DB
// text — so this maps those codes to plain-language reasons. Anything it
// doesn't recognise falls back to a calm generic line rather than leaking
// "duplicate key value violates unique constraint ..." to a customer.

export function errorText(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const e = error as { message?: unknown; error_description?: unknown; details?: unknown };
    if (typeof e.message === 'string') return e.message;
    if (typeof e.error_description === 'string') return e.error_description;
    if (typeof e.details === 'string') return e.details;
  }
  return '';
}

const RULES: [RegExp, string][] = [
  // Connectivity / session
  [/network request failed|failed to fetch|network error|timeout|timed out|fetch failed/i, "Couldn't reach Thrill Mill Club. Check your internet connection and try again."],
  [/jwt expired|invalid jwt|not authenticated|UNAUTHORIZED/i, 'Your session has expired. Please sign in again to continue.'],

  // Booking / wallet
  [/INSUFFICIENT_CREDITS/, "Your team doesn't have enough credits for this booking. Ask your Host to top up the wallet with the club Admin."],
  [/HOLD_EXPIRED/, 'Your 1-minute hold ran out before the booking was confirmed. Pick the slot again — it may still be free.'],
  [/SLOTS_MUST_BE_SAME_DAY/, 'All slots in one booking must be on the same day. Book other days separately.'],
  [/SLOTS_MUST_BE_SAME_SPORT/, 'One booking can only include slots from a single sport. Book each sport separately.'],
  [/SLOTS_MUST_BE_SAME_TEAM/, 'The selected slots belong to different teams. Please start the booking again.'],
  [/SLOT_UNAVAILABLE/, 'Someone else just took this slot, or it is no longer open. Please choose another time.'],
  [/SLOT_IN_PAST/, 'This slot has already started or finished, so it can no longer be booked.'],
  [/PARTICIPANT_INVALID/, 'One of the selected players is no longer an active member of this team.'],
  [/NO_SLOTS_SELECTED/, 'Pick at least one time slot first.'],
  [/NO_PARTICIPANTS/, 'Pick at least one player for this session.'],
  [/PARTICIPANTS_LOCKED/, 'This session has already started, so its players can no longer be changed.'],
  [/CANCELLATION_NOT_ALLOWED/, 'This booking can no longer be cancelled.'],
  [/TEAM_ARCHIVED/, 'This team has been archived by the club Admin, so it can no longer make bookings.'],
  [/MEMBERSHIP_INACTIVE/, "This team's membership isn't active yet. Bookings open once the club Admin verifies your payment and loads your credits."],

  // Teams / people
  [/TEAM_NAME_TAKEN|uq_teams_name_active/, 'A team with this name already exists. Please choose a different team name.'],
  [/PHONE_TAKEN|uq_profiles_phone/i, 'This mobile number is already registered with another account. Use a different number or sign in with that account.'],
  [/INVALID_PHONE/, 'Enter a valid 10-digit Indian mobile number (it should start with 6, 7, 8 or 9).'],
  [/INVALID_TEAM_NAME/, 'Enter a team name (at least 3 characters).'],
  [/TEAM_FULL/, 'This team already has the maximum of 10 members.'],
  [/MEMBER_ALREADY_ON_TEAM/, 'This person is already on the team or has a pending invite.'],
  [/TEAM_ALREADY_FINALIZED/, 'This team has already been submitted, so it can no longer be discarded.'],
  [/HOST_MUST_TRANSFER/, "You're the Host of an active team. Hand the Host role to another member (or ask the Admin to archive the team) before deleting your account."],

  // Polls / chat
  [/POLL_CLOSED/, 'This poll has already closed, so votes can no longer be changed.'],
  [/INVALID_POLL/, 'A poll needs a question and between 2 and 6 options.'],

  // Generic
  [/FORBIDDEN|permission denied|row-level security|violates row-level/i, "You don't have permission to do this. Only the right role (for example the team Host or Co-host) can."],
  [/NOT_FOUND|PGRST116|no rows/i, "We couldn't find that. It may have been removed — please go back and refresh."],
];

export function friendlyError(error: unknown, fallback?: string): string {
  const text = errorText(error);
  for (const [pattern, message] of RULES) {
    if (pattern.test(text)) return message;
  }
  return fallback ?? 'Something went wrong on our side. Please try again in a moment.';
}
