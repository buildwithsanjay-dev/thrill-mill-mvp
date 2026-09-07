import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentProps } from 'react';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing } from '@/constants/theme';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

type ButtonVariant = 'primary' | 'outline';

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  iconLeft?: IoniconName;
  iconRight?: IoniconName;
  loading?: boolean;
  disabled?: boolean;
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  iconLeft,
  iconRight,
  loading = false,
  disabled = false,
}: ButtonProps) {
  const isOutline = variant === 'outline';
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        isOutline ? styles.outline : styles.primary,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isOutline ? colors.primary : colors.white} />
      ) : (
        <View style={styles.content}>
          {iconLeft && (
            <Ionicons
              name={iconLeft}
              size={18}
              color={isOutline ? colors.text : colors.white}
              style={styles.iconLeft}
            />
          )}
          <Text style={[styles.label, isOutline ? styles.labelOutline : styles.labelPrimary]}>
            {title}
          </Text>
          {iconRight && (
            <Ionicons
              name={iconRight}
              size={18}
              color={isOutline ? colors.text : colors.white}
              style={styles.iconRight}
            />
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 52,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  outline: {
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.text,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.85,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  labelPrimary: {
    color: colors.white,
  },
  labelOutline: {
    color: colors.text,
  },
  iconLeft: {
    marginRight: spacing.sm,
  },
  iconRight: {
    marginLeft: spacing.sm,
  },
});
