import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';

import { colors } from '@/constants/theme';

const LOGO = require('../../../assets/logo.jpeg');

// The real Thrill Mill Club logo (mobile/assets/logo.jpeg) — a square image
// whose corners are white, so cropping it to a circle via the badge's own
// `overflow: hidden` + `borderRadius` (rather than needing a pre-cropped
// asset) matches the circular badge shown across the Sign In, Welcome, and
// Ready to Play screens.
export function LogoBadge({ size = 92 }: { size?: number }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image source={LOGO} style={styles.image} contentFit="cover" />
    </View>
  );
}

const styles = StyleSheet.create({
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
