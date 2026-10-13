import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { HALLOWEEN_DECOR } from '@/constants/seasonDecorAssets';
import { useSeason } from '../SeasonProvider';

// The garland's own natural aspect ratio (761x187 — see
// scripts/_cutout_bunting.py) — used to size each tile from a fixed height.
const GARLAND_RATIO = 761 / 187;
const TILE_HEIGHT = 26;
const TILE_WIDTH = TILE_HEIGHT * GARLAND_RATIO;
// Enough tiles to cover any phone width edge-to-edge; `wrap`'s own
// overflow:hidden clips whatever doesn't fit rather than wrapping to a
// second row.
const TILE_COUNT = 6;

// A single owner-supplied image (string + flags + bats already drawn
// together) repeated edge-to-edge, replacing the earlier version that
// composed separate flag cut-outs over a code-drawn line — that read as
// disconnected dots floating above an unrelated straight line.
export function Bunting() {
  const { season } = useSeason();
  if (season !== 'halloween') return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.row}>
        {Array.from({ length: TILE_COUNT }).map((_, i) => (
          <Image key={i} source={HALLOWEEN_DECOR.buntingGarland} style={styles.tile} contentFit="contain" />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: TILE_HEIGHT,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  row: { flexDirection: 'row' },
  tile: { width: TILE_WIDTH, height: TILE_HEIGHT },
});
