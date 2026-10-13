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

  // Two bats, offset in both position and animation phase (the second is
  // always one frame ahead) so they don't flap in unison — reads as a small
  // flock rather than one lone bat.
  const secondFrame = FRAMES[(frameIndex + 1) % FRAMES.length];

  return (
    <>
      <Image source={FRAMES[frameIndex]} style={styles.bat1} contentFit="contain" />
      <Image source={secondFrame} style={styles.bat2} contentFit="contain" />
    </>
  );
}

const styles = StyleSheet.create({
  // Both sit well clear of the bell/avatar icon cluster (which occupies
  // roughly the rightmost 100px of the header) — they previously overlapped
  // the notification bell.
  bat1: { position: 'absolute', top: 0, right: 128, width: 18, height: 18 },
  bat2: { position: 'absolute', top: 20, right: 158, width: 13, height: 13, opacity: 0.85 },
});
