import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, radii, spacing } from '@/constants/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type GradientButtonProps = {
  title: string;
  onPress: () => void;
  iconLeft?: IoniconName;
  iconRight?: IoniconName;
  loading?: boolean;
  disabled?: boolean;
};

// Onboarding-only CTA — visually louder than the shared `Button` (which
// stays flat-color for the rest of the app) since these are the very
// first three screens a new user ever sees. Kept as its own component
// rather than adding a gradient variant to `Button` so this doesn't
// silently change every primary button across the app.
export function GradientButton({
  title,
  onPress,
  iconLeft,
  iconRight,
  loading = false,
  disabled = false,
}: GradientButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [styles.wrap, isDisabled && styles.disabled, pressed && !isDisabled && styles.pressed]}
    >
      <LinearGradient
        colors={[colors.primary, colors.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.base}
      >
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <View style={styles.content}>
            {iconLeft && <Ionicons name={iconLeft} size={18} color={colors.white} style={styles.iconLeft} />}
            <Text style={styles.label}>{title}</Text>
            {iconRight && <Ionicons name={iconRight} size={18} color={colors.white} style={styles.iconRight} />}
          </View>
        )}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.pill,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  base: {
    height: 56,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.9,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
    letterSpacing: 0.2,
  },
  iconLeft: {
    marginRight: spacing.sm,
  },
  iconRight: {
    marginLeft: spacing.sm,
  },
});
