import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';

import { HALLOWEEN_DECOR } from '@/constants/seasonDecorAssets';
import { useSeason } from '../SeasonProvider';

const FRAMES = [HALLOWEEN_DECOR.batWingsUp, HALLOWEEN_DECOR.batWingsLevel, HALLOWEEN_DECOR.batWingsDown];
const FRAME_INTERVAL_MS = 220;

export function HeaderBats() {
  const { season } = useSeason();
  const [frameIndex, setFrameIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (season !== 'halloween') return;
    intervalRef.current = setInterval(() => {
      setFrameIndex((i) => (i + 1) % FRAMES.length);
    }, FRAME_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [season]);

  if (season !== 'halloween') return null;

  return <Image source={FRAMES[frameIndex]} style={styles.bat} contentFit="contain" />;
}

const styles = StyleSheet.create({
  bat: { position: 'absolute', top: 2, right: 56, width: 22, height: 22 },
});
