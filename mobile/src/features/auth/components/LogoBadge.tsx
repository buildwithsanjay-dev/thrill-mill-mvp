import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/theme';

// Placeholder for the real Thrill Mill Club logo (a circular badge in the
// Figma exports at assets/ui/welcome.png and assets/ui/Sign In.png). Swap
// this for an <Image> once the logo is exported as a standalone transparent
// PNG into mobile/assets/.
export function LogoBadge({ size = 92 }: { size?: number }) {
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.32 }]}>TMC</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  text: {
    fontWeight: '800',
    color: colors.primary,
    letterSpacing: 1,
  },
});
