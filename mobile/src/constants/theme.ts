import { StyleSheet } from 'react-native';

// ---------------------------------------------------------------------------
// Thrill Mill Club design tokens.
//
// The palette is taken from the logo: deep NAVY (the "T" mark and wordmark),
// TEAL (the "MILL" wordmark and the arc), ORANGE (the flare and the joystick)
// and a touch of AMBER. The earlier dark-forest-green had nothing to do with
// the brand; every screen now draws from these tokens, so the whole app moves
// together — and there is a matching dark palette that follows the phone's
// light/dark setting (or the manual override in Profile).
//
// HOW IT WORKS: `colors` is a live view of whichever palette is active, and
// `themedStyles()` builds a screen's StyleSheet lazily per palette. Screens
// therefore keep writing `colors.text`, `colors.surface`, ... exactly as
// before; the ThemeProvider (components/ThemeProvider.tsx) picks the active
// scheme and remounts the navigation tree when it changes.
// ---------------------------------------------------------------------------

export type Scheme = 'light' | 'dark';

export type Palette = {
  // surfaces
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  overlay: string;
  // text
  text: string;
  textMuted: string;
  textFaint: string;
  // brand teal
  primary: string;
  primaryDark: string;
  primarySoft: string;
  primaryBorder: string;
  // hero cards (the navy wallet / upcoming cards)
  hero: string;
  heroSurface: string;
  heroText: string;
  heroMuted: string;
  heroAccent: string;
  // brand orange (main call-to-action accent)
  accent: string;
  accentDark: string;
  accentSoft: string;
  accentText: string;
  accentBorder: string;
  // semantic
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  warningText: string;
  danger: string;
  dangerSoft: string;
  dangerBorder: string;
  info: string;
  infoSoft: string;
  infoText: string;
  // constants
  white: string;
};

const light: Palette = {
  background: '#F4F7FB',
  surface: '#FFFFFF',
  surfaceAlt: '#EDF2F7',
  border: '#E2E8F0',
  overlay: 'rgba(11,31,63,0.55)',
  text: '#0B1F3F',
  textMuted: '#5B6B82',
  textFaint: '#94A3B8',
  primary: '#0E7C86',
  primaryDark: '#0B5F68',
  primarySoft: '#E3F3F4',
  primaryBorder: '#B7E0E3',
  hero: '#0B2545',
  heroSurface: '#1B3A63',
  heroText: '#FFFFFF',
  heroMuted: '#9FB3CC',
  heroAccent: '#6FD0D8',
  accent: '#EA5F14',
  accentDark: '#C94F0B',
  accentSoft: '#FFF1E6',
  accentText: '#9A3A05',
  accentBorder: '#FCD1AE',
  success: '#2F855A',
  successSoft: '#E4F4EA',
  warning: '#B7791F',
  warningSoft: '#FEF6E0',
  warningText: '#7A4E0B',
  danger: '#D64545',
  dangerSoft: '#FDECEC',
  dangerBorder: '#F6C6C6',
  info: '#2B6CB0',
  infoSoft: '#EAF2FB',
  infoText: '#1E4E8C',
  white: '#FFFFFF',
};

const dark: Palette = {
  background: '#0A1220',
  surface: '#121C2F',
  surfaceAlt: '#1A2740',
  border: '#26364F',
  overlay: 'rgba(0,0,0,0.65)',
  text: '#E8EEF7',
  textMuted: '#93A4BD',
  textFaint: '#64748B',
  primary: '#2AA3AE',
  primaryDark: '#1F8792',
  primarySoft: '#12333A',
  primaryBorder: '#1E5660',
  hero: '#152B4D',
  heroSurface: '#22406B',
  heroText: '#FFFFFF',
  heroMuted: '#9DB2D0',
  heroAccent: '#6FD0D8',
  accent: '#F0661A',
  accentDark: '#D5540E',
  accentSoft: '#3A2414',
  accentText: '#FDBA85',
  accentBorder: '#6B3B17',
  success: '#4CB983',
  successSoft: '#123326',
  warning: '#E0B04A',
  warningSoft: '#33280F',
  warningText: '#F1D28A',
  danger: '#F07171',
  dangerSoft: '#3A1B1F',
  dangerBorder: '#6B2A30',
  info: '#63A4EA',
  infoSoft: '#132B47',
  infoText: '#A9CFF7',
  white: '#FFFFFF',
};

export const palettes: Record<Scheme, Palette> = { light, dark };

// The scheme currently in effect. Set by ThemeProvider before children render.
let activeScheme: Scheme = 'light';
export function setActiveScheme(scheme: Scheme): void {
  activeScheme = scheme;
}
export function getActiveScheme(): Scheme {
  return activeScheme;
}

// Live view of the active palette: `colors.text` always returns the value for
// whichever scheme is active at the moment it is read.
export const colors: Readonly<Palette> = new Proxy({} as Palette, {
  get: (_target, key: string) => palettes[activeScheme][key as keyof Palette],
});

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

// Kept for the multi-step flows (Create Team, Add Members, Choose Membership,
// Wallet Activity) that were written against these names. They now simply
// alias the shared palette — one theme for the whole app.
export const screenColors = {
  get background() { return colors.background; },
  get surface() { return colors.surface; },
  get surfaceAlt() { return colors.surfaceAlt; },
  get border() { return colors.border; },
  get text() { return colors.text; },
  get textMuted() { return colors.textMuted; },
  get primary() { return colors.primary; },
  get primaryLight() { return colors.primary; },
  get success() { return colors.success; },
  get danger() { return colors.danger; },
};

type Styles = StyleSheet.NamedStyles<any>;

// Drop-in for `StyleSheet.create` that follows the active theme: the factory
// runs lazily (once per scheme) and every `styles.x` read returns the entry
// for the scheme that is active right now.
export function themedStyles<T extends Styles | Styles>(factory: () => T): T {
  const cache: Partial<Record<Scheme, T>> = {};
  return new Proxy({} as T, {
    get: (_target, key: string) => {
      let built = cache[activeScheme];
      if (!built) {
        built = StyleSheet.create(factory()) as T;
        cache[activeScheme] = built;
      }
      return (built as Record<string, unknown>)[key];
    },
  });
}
