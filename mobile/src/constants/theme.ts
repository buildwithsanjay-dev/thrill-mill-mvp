// Design tokens sampled from the Figma exports in assets/ui/. Not pixel-exact
// (sampled visually, not from Figma's own values) — nudge these once real
// design tokens/a style guide are exported, per CLAUDE.md's UI/UX Conventions
// note that conventions aren't formally established yet.
export const colors = {
  primary: '#0C5C54',
  primaryDark: '#094943',
  text: '#131B34',
  textMuted: '#6B7280',
  background: '#FFFFFF',
  border: '#E5E7EB',
  white: '#FFFFFF',
  danger: '#DC2626',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

// A handful of screens in the Figma export (Create Team, Add Members,
// Choose Membership, Wallet Activity, the top cards on Team/Manage
// Booking) are intentionally dark-surfaced, not a global light/dark mode
// toggle. These tokens are scoped to just those screens.
export const darkColors = {
  background: '#0A0F1E',
  surface: '#111A2E',
  surfaceAlt: '#0D1526',
  border: '#22304A',
  text: '#F8FAFC',
  textMuted: '#8B96AC',
  primary: colors.primary,
  primaryLight: '#1BB6A6',
  success: '#22C55E',
  danger: '#F87171',
} as const;
