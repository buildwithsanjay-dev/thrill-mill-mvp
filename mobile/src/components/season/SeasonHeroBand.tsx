import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { spacing } from '@/constants/theme';
import { HALLOWEEN_DECOR } from '@/constants/seasonDecorAssets';
import { useAppearance } from '../ThemeProvider';
import { useSeason } from '../SeasonProvider';

// Bleeds edge-to-edge (negative margin cancels the parent ScrollView's own
// `padding: spacing.lg`, which every screen that uses this band shares) and
// drops the rounded-card look — a boxed card read as too contained next to
// the reference mockup. The scene art itself already fades to the page
// background in its own bottom 20% (see halloween-asset-prompts.md), so no
// border/overflow clipping is needed for it to blend into the page below.
// `overflow` is intentionally NOT hidden here: a mascot peek passed in as a
// child is allowed to break past the band's bottom edge, matching the
// reference's mascot-bleeding-past-the-frame look.
export function SeasonHeroBand({ children }: PropsWithChildren) {
  const { season } = useSeason();
  const { scheme } = useAppearance();

  if (season !== 'halloween') return <>{children}</>;

  const hour = new Date().getHours();
  const isNight = scheme === 'dark' || hour < 5 || hour >= 17;
  const source = isNight ? HALLOWEEN_DECOR.heroNight : HALLOWEEN_DECOR.heroDay;

  return (
    <View style={styles.wrap}>
      <Image source={source} style={styles.scene} contentFit="cover" />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -spacing.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  scene: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  content: { paddingBottom: spacing.sm },
});
