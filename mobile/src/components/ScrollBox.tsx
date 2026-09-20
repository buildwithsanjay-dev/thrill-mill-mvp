import type { PropsWithChildren } from 'react';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, spacing, themedStyles } from '@/constants/theme';

// A fixed-height container whose CONTENT scrolls inside it, so a long log or
// activity list never stretches the whole page. `nestedScrollEnabled` lets
// Android scroll the list independently of the page scrolling around it.
//   variant "card"  — bordered surface (for rows that have no card of their own)
//   variant "plain" — no frame (for rows that already look like cards)
export function ScrollBox({
  children,
  maxHeight = 340,
  variant = 'card',
  style,
}: PropsWithChildren<{ maxHeight?: number; variant?: 'card' | 'plain'; style?: StyleProp<ViewStyle> }>) {
  return (
    <View style={[variant === 'card' ? styles.card : undefined, { maxHeight }, style]}>
      <ScrollView
        nestedScrollEnabled
        showsVerticalScrollIndicator
        contentContainerStyle={variant === 'card' ? styles.cardContent : undefined}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = themedStyles(() => ({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  cardContent: { paddingHorizontal: spacing.md },
}));
