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

export function Bunting() {
  const { season } = useSeason();
  if (season !== 'halloween') return null;

  return (
    <View style={styles.row} pointerEvents="none">
      {FLAGS.map((source, i) => (
        <Image key={i} source={source} style={styles.flag} contentFit="contain" />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'flex-start', height: 20 },
  flag: { width: 18, height: 18 },
});
