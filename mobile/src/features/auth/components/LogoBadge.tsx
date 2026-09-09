import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { colors } from '@/constants/theme';

const LOGO = require('../../../../assets/logo.jpeg');

// The real Thrill Mill Club logo (mobile/assets/logo.jpeg) — a square image
// whose corners are white, so cropping it to a circle via the badge's own
// `overflow: hidden` + `borderRadius` (rather than needing a pre-cropped
// asset) matches the circular badge shown across the Sign In, Welcome, and
// Ready to Play screens.
//
// `ring` adds a thin gradient border around the badge — used where the
// badge sits directly on a photo/dark surface (Welcome's hero sheet,
// Ready to Play) so it doesn't look like it's floating with no edge;
// omitted on Sign In where the badge already sits on plain white.
export function LogoBadge({ size = 92, ring = false }: { size?: number; ring?: boolean }) {
  const badge = (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image source={LOGO} style={styles.image} contentFit="cover" />
    </View>
  );

  if (!ring) return badge;

  const ringSize = size + 8;
  return (
    <LinearGradient
      colors={[colors.primary, '#1BB6A6', colors.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.ring, { width: ringSize, height: ringSize, borderRadius: ringSize / 2 }]}
    >
      {badge}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  badge: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
