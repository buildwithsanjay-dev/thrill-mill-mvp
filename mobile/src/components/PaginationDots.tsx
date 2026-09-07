import { StyleSheet, View } from 'react-native';

import { colors } from '@/constants/theme';

type PaginationDotsProps = {
  count: number;
  activeIndex: number;
};

export function PaginationDots({ count, activeIndex }: PaginationDotsProps) {
  return (
    <View style={styles.row}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={[styles.dot, index === activeIndex && styles.dotActive]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
