import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { HALLOWEEN_DECOR } from '@/constants/seasonDecorAssets';
import { useSeason } from '../SeasonProvider';

// The garland's own natural aspect ratio (761x187 — see
// scripts/_cutout_bunting.py) — used to size each tile from a fixed height.
const GARLAND_RATIO = 761 / 187;
const TILE_HEIGHT = 26;
const TILE_WIDTH = TILE_HEIGHT * GARLAND_RATIO;
// Enough tiles to cover the full screen width (and so the credits card,
// which spans the same content width) edge-to-edge; the parent's own
// overflow:hidden (see HomeScreen's creditsCardBunting) clips any excess
// rather than wrapping to a second row.
const TILE_COUNT = 6;

// A single owner-supplied image (string + flags + bats already drawn
// together), tiled edge-to-edge. Scrolls as part of whatever it's placed
// in — this used to be its own fixed strip pinned above the tab bar on
// every screen, which read as floating disconnected from anything; now the
// caller attaches it to a specific element (the Home credits card) instead.
export function Bunting() {
  const { season } = useSeason();
  if (season !== 'halloween') return null;

  return (
    <View style={styles.row}>
      {Array.from({ length: TILE_COUNT }).map((_, i) => (
        <Image key={i} source={HALLOWEEN_DECOR.buntingGarland} style={styles.tile} contentFit="contain" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  tile: { width: TILE_WIDTH, height: TILE_HEIGHT },
});
