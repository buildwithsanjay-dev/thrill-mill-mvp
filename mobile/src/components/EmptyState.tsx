import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { colors, spacing } from '@/constants/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export function EmptyState({
  icon,
  title,
  message,
}: {
  icon: IoniconName;
  title: string;
  message?: string;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={28} color={colors.textMuted} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  message: {
    marginTop: spacing.xs,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
