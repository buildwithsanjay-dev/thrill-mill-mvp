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

// Surface tokens for the multi-step flows (Create Team, Add Members, Choose
// Membership, Wallet Activity). These screens were originally drawn in a dark
// navy style, which made the app look like it had two colour themes — the
// owner asked for ONE theme across every screen, so these now resolve to the
// same light palette as the rest of the app. The names (surface, surfaceAlt,
// primaryLight, ...) are kept so those screens' styles didn't need rewriting.
export const screenColors = {
  background: '#F7F8FA',
  surface: '#FFFFFF',
  surfaceAlt: '#F1F5F9',
  border: colors.border,
  text: colors.text,
  textMuted: colors.textMuted,
  primary: colors.primary,
  primaryLight: colors.primary,
  success: '#16A34A',
  danger: colors.danger,
} as const;
