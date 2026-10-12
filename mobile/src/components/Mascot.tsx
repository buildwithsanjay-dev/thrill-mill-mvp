import { Image } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';

import { MASCOT_ASSETS, type MascotPose } from '@/constants/mascotAssets';
import { useSeason } from './SeasonProvider';

// Always renders — outside a festival window (or with decorations turned
// off) this simply shows the base costume. Never gate this component itself
// on decorationsEnabled; only the purely decorative pieces (SeasonHeroBand,
// HeaderBats, Bunting, ...) do that.
export function Mascot({
  pose,
  size = 64,
  style,
}: {
  pose: MascotPose;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const { season } = useSeason();
  const source = MASCOT_ASSETS[season][pose];
  return <Image source={source} style={[{ width: size, height: size }, style]} contentFit="contain" />;
}
