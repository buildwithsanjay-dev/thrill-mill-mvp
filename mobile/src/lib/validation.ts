// Client-side form validation. These give instant, inline feedback; the
// database enforces the same rules again (CLAUDE.md: the server is always
// authoritative), so a bypassed client still can't store bad data.

// Indian mobile numbers: 10 digits, first digit 6-9. Callers store them as
// "+91" + these 10 digits.
export function cleanPhoneDigits(input: string): string {
  return input.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').slice(0, 10);
}

export function validatePhone(input: string): string | undefined {
  const digits = cleanPhoneDigits(input);
  if (!digits) return 'Enter your mobile number.';
  if (digits.length !== 10) return 'A mobile number has exactly 10 digits.';
  if (!/^[6-9]/.test(digits)) return 'Indian mobile numbers start with 6, 7, 8 or 9.';
  return undefined;
}

export function validateFullName(input: string): string | undefined {
  const name = input.trim().replace(/\s+/g, ' ');
  if (!name) return 'Enter your full name.';
  if (name.length < 2) return 'Your name needs at least 2 characters.';
  if (name.length > 60) return 'Keep your name under 60 characters.';
  if (!/[\p{L}]/u.test(name)) return 'Your name should contain letters.';
  return undefined;
}

export function validateTeamName(input: string): string | undefined {
  const name = input.trim().replace(/\s+/g, ' ');
  if (!name) return 'Give your team a name.';
  if (name.length < 3) return 'A team name needs at least 3 characters.';
  if (name.length > 40) return 'Keep the team name under 40 characters.';
  return undefined;
}
