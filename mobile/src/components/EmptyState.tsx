import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import { colors, spacing, themedStyles } from '@/constants/theme';
import { Mascot } from './Mascot';
import type { MascotPose } from '@/constants/mascotAssets';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export function EmptyState({
  icon,
  mascot,
  title,
  message,
}: {
  icon: IoniconName;
  mascot?: MascotPose;
  title: string;
  message?: string;
}) {
  return (
    <View style={styles.container}>
      {mascot ? (
        <Mascot pose={mascot} size={56} style={styles.mascot} />
      ) : (
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={28} color={colors.textMuted} />
        </View>
      )}
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = themedStyles(() => ({
  container: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  mascot: { marginBottom: spacing.md },
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
}));
