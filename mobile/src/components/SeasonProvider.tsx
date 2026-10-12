import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { getCalendarSeason, type SeasonId } from '@/features/seasons/seasonWindows';

const STORAGE_KEY = 'festive-decorations-enabled';

type SeasonContextValue = {
  // 'base' whenever decorations are off OR no festival is active today —
  // callers never need to check decorationsEnabled separately for display
  // purposes, only this one value.
  season: SeasonId;
  decorationsEnabled: boolean;
  setDecorationsEnabled: (next: boolean) => void;
};

const SeasonContext = createContext<SeasonContextValue>({
  season: 'base',
  decorationsEnabled: true,
  setDecorationsEnabled: () => undefined,
});

export function SeasonProvider({ children }: PropsWithChildren) {
  // Defaults to true (on) so a user who has never touched the toggle sees
  // the festival during its window — matches the Appearance preference's
  // "system by default, override if you want" shape, not an opt-in one.
  const [decorationsEnabled, setDecorationsEnabledState] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === 'false') setDecorationsEnabledState(false);
      })
      .catch(() => undefined);
  }, []);

  const setDecorationsEnabled = (next: boolean) => {
    setDecorationsEnabledState(next);
    AsyncStorage.setItem(STORAGE_KEY, next ? 'true' : 'false').catch(() => undefined);
  };

  const calendarSeason = getCalendarSeason();
  const season: SeasonId = decorationsEnabled ? calendarSeason : 'base';

  return (
    <SeasonContext.Provider value={{ season, decorationsEnabled, setDecorationsEnabled }}>
      {children}
    </SeasonContext.Provider>
  );
}

export function useSeason(): SeasonContextValue {
  return useContext(SeasonContext);
}
