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
// Exported so screens can match their own text colour to whichever scene is
// actually showing — the night scene can appear while the app is still in
// LIGHT theme (it's simply evening), and the light theme's normal dark-navy
// text is unreadable against it. True whenever the dark/night art is what's
// behind the content, regardless of why (evening hour, or dark theme).
export function useIsHeroNight(): boolean {
  const { scheme } = useAppearance();
  const hour = new Date().getHours();
  return scheme === 'dark' || hour < 5 || hour >= 17;
}

export function SeasonHeroBand({ children }: PropsWithChildren) {
  const { season } = useSeason();
  const isNight = useIsHeroNight();

  if (season !== 'halloween') return <>{children}</>;

  const source = isNight ? HALLOWEEN_DECOR.heroNight : HALLOWEEN_DECOR.heroDay;

  return (
    <View style={styles.wrap}>
      <Image source={source} style={styles.scene} contentFit="cover" />
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Cancels the parent ScrollView's own `padding: spacing.lg` on ALL sides
  // it previously only cancelled horizontally, which left the scroll's own
  // top padding plus this band's own paddingTop plus the title's own
  // marginTop all stacking into one large empty gap before any Halloween
  // content appeared. No paddingTop here at all now — the screen's own
  // title (ScreenIntro's marginTop, or titleRow's) is the only top spacing,
  // counted from the image's true top edge (flush under the header).
  wrap: { marginHorizontal: -spacing.lg, marginTop: -spacing.lg, paddingHorizontal: spacing.lg },
  scene: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  content: { paddingBottom: spacing.sm },
});
