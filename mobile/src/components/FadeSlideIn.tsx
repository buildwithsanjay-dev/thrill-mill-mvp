import { useEffect, useState } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

type FadeSlideInProps = {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
};

// Small, dependency-free entrance animation (plain RN Animated — no
// reanimated/gesture-handler install needed) used to give onboarding
// screens a bit of motion instead of everything just snapping onto
// screen at once. Fades in while sliding up `distance` px.
//
// Uses useState (not useRef) to hold the Animated.Value — the project's
// eslint react-hooks/refs rule flags reading a ref's .current during
// render, and Animated's own docs pattern of `useRef(new Animated.Value)`
// trips that even though it's the standard, safe RN Animated usage. State
// initialized via the lazy-initializer form avoids the warning and never
// re-creates the value on re-render.
export function FadeSlideIn({ children, delay = 0, distance = 16, style }: FadeSlideInProps) {
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: 520,
      delay,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [distance, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
