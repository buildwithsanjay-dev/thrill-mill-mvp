import { useEffect, useState } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, themedStyles } from '@/constants/theme';

// Big animated tick for full-screen success states: the badge springs in, a
// halo pulses outward, then the tick pops. Purely visual.
export function AnimatedSuccess({ size = 112 }: { size?: number }) {
  const [badge] = useState(() => new Animated.Value(0));
  const [tick] = useState(() => new Animated.Value(0));
  const [halo] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.sequence([
      Animated.spring(badge, { toValue: 1, damping: 11, stiffness: 150, useNativeDriver: true }),
      Animated.spring(tick, { toValue: 1, damping: 8, stiffness: 220, useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(halo, { toValue: 1, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(halo, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();
    // Values are stable; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inner = size * 0.62;
  return (
    <View style={{ width: size * 1.5, height: size * 1.5, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          styles.halo,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] }),
            transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
          },
        ]}
      />
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.successSoft,
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale: badge }],
        }}
      >
        <View
          style={{
            width: inner,
            height: inner,
            borderRadius: inner / 2,
            backgroundColor: colors.success,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Animated.View style={{ transform: [{ scale: tick }] }}>
            <Ionicons name="checkmark" size={inner * 0.62} color={colors.white} />
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = themedStyles(() => ({
  halo: { position: 'absolute', backgroundColor: colors.success },
}));
