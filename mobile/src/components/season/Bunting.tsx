import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { HALLOWEEN_DECOR } from '@/constants/seasonDecorAssets';
import { useSeason } from '../SeasonProvider';

const FLAG_PATTERN = [HALLOWEEN_DECOR.buntingOrange, HALLOWEEN_DECOR.buntingPurple, HALLOWEEN_DECOR.buntingBat];
// Repeated enough times to fill the row edge-to-edge with closely-packed
// flags — spread thin across the whole screen width (the original 5) read
// as disconnected dots next to one long straight thread line. Densely
// packed, small flags plus a thread sized to match their actual span reads
// as one continuous garland instead.
const FLAGS = [...FLAG_PATTERN, ...FLAG_PATTERN, ...FLAG_PATTERN, ...FLAG_PATTERN];

export function Bunting() {
  const { season } = useSeason();
  if (season !== 'halloween') return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.thread} />
      <View style={styles.row}>
        {FLAGS.map((source, i) => (
          <Image key={i} source={source} style={styles.flag} contentFit="contain" />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    height: 24,
    justifyContent: 'flex-end',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  // Spans exactly the same horizontal extent as `row` (both sit inside the
  // same `wrap`, `row`'s own paddingHorizontal keeps the first/last flag off
  // the screen edges) so the thread starts and ends right at the flags,
  // never extending past them as a bare line.
  thread: {
    position: 'absolute',
    top: 3,
    left: 16,
    right: 16,
    height: 1,
    backgroundColor: 'rgba(26,26,46,0.5)',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 2,
  },
  flag: { width: 13, height: 13 },
});
