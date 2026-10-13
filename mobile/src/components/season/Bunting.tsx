import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { HALLOWEEN_DECOR } from '@/constants/seasonDecorAssets';
import { useSeason } from '../SeasonProvider';

const FLAGS = [
  HALLOWEEN_DECOR.buntingOrange,
  HALLOWEEN_DECOR.buntingPurple,
  HALLOWEEN_DECOR.buntingBat,
  HALLOWEEN_DECOR.buntingOrange,
  HALLOWEEN_DECOR.buntingPurple,
];

// A continuous string (the individual flag sprites don't include one — each
// is drawn as an isolated cut-out, see halloween-asset-prompts.md's SP10)
// sits behind the row so the flags read as strung together instead of
// floating separately. `elevation`/`shadowOpacity` keep it crisply above
// whatever scrolls past underneath it.
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
    height: 26,
    justifyContent: 'flex-end',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  thread: {
    position: 'absolute',
    top: 2,
    left: 12,
    right: 12,
    height: 1,
    backgroundColor: 'rgba(26,26,46,0.55)',
  },
  row: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start', paddingTop: 1 },
  flag: { width: 18, height: 18 },
});
