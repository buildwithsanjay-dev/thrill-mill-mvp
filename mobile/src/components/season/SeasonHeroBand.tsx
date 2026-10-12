import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { HALLOWEEN_DECOR } from '@/constants/seasonDecorAssets';
import { useAppearance } from '../ThemeProvider';
import { useSeason } from '../SeasonProvider';

export function SeasonHeroBand({ children }: PropsWithChildren) {
  const { season } = useSeason();
  const { scheme } = useAppearance();

  if (season !== 'halloween') return <>{children}</>;

  const hour = new Date().getHours();
  const isNight = scheme === 'dark' || hour < 5 || hour >= 17;
  const source = isNight ? HALLOWEEN_DECOR.heroNight : HALLOWEEN_DECOR.heroDay;

  return (
    <View style={styles.wrap}>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 12, overflow: 'hidden' },
  content: { padding: 2 },
});
