import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';

import { useSeason } from './SeasonProvider';

// Same technique as HeaderBats (cycle pre-rendered frames on a timer), but
// these 3 frames are specific to the Sign-in screen's wave, not part of the
// general Mascot pose set — frame 1 is the existing wave-hello.webp, frames
// 2/3 are the generated mid/out frames (see
// docs/seasonal-theming/sign-in-wave-animation-prompts.md).
const FRAMES = {
  base: [
    require('../../assets/mascot/base/wave-hello.webp'),
    require('../../assets/mascot/base/wave-hello-mid.webp'),
    require('../../assets/mascot/base/wave-hello-out.webp'),
  ],
  halloween: [
    require('../../assets/mascot/halloween/wave-hello.webp'),
    require('../../assets/mascot/halloween/wave-hello-mid.webp'),
    require('../../assets/mascot/halloween/wave-hello-out.webp'),
  ],
};

// Ping-pongs up -> mid -> out -> mid -> (repeat) instead of snapping straight
// back from "out" to "up" — reads as one continuous side-to-side wave rather
// than a jump-cut. Slower cadence than the bat flap (220ms) since a wave is
// a calmer gesture.
const FRAME_ORDER = [0, 1, 2, 1];
const FRAME_INTERVAL_MS = 450;

export function AnimatedWaveMascot({
  size = 150,
  style,
}: {
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const { season } = useSeason();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setStep((s) => (s + 1) % FRAME_ORDER.length);
    }, FRAME_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const frames = FRAMES[season];
  const source = frames[FRAME_ORDER[step]];

  return <Image source={source} style={[{ width: size, height: size }, style]} contentFit="contain" />;
}
