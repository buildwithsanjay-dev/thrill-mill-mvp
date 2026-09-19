import { createContext, Fragment, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { setActiveScheme, type Scheme } from '@/constants/theme';

export type AppearancePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'appearance-preference';

type ThemeContextValue = {
  scheme: Scheme;
  preference: AppearancePreference;
  setPreference: (next: AppearancePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  scheme: 'light',
  preference: 'system',
  setPreference: () => undefined,
});

// Decides light vs dark: the phone's own setting by default ("system"), or
// the manual choice saved from Profile -> Appearance. Everything colour-related
// reads the active scheme through constants/theme.ts, so this provider only
// has to (1) pick the scheme and (2) publish it before children render.
export function AppThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<AppearancePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') setPreferenceState(stored);
      })
      .catch(() => undefined);
  }, []);

  const scheme: Scheme = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;

  // Must happen before any child renders, so styles built this pass use the
  // right palette. Idempotent, so it is safe to repeat on every render.
  setActiveScheme(scheme);

  const setPreference = (next: AppearancePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => undefined);
  };

  return <ThemeContext.Provider value={{ scheme, preference, setPreference }}>{children}</ThemeContext.Provider>;
}

export function useAppearance(): ThemeContextValue {
  return useContext(ThemeContext);
}

// Wrap the visual tree in this: it remounts its children when the scheme
// changes, which is what makes every screen rebuild its styles for the new
// palette (styles are cached per scheme, so the rebuild is cheap).
export function ThemedTree({ children }: PropsWithChildren) {
  const { scheme } = useContext(ThemeContext);
  return <Fragment key={scheme}>{children}</Fragment>;
}
