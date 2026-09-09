import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';

type TextFieldProps = TextInputProps & {
  label?: string;
  prefix?: string;
  // Some screens (Create Team, Add Members, Choose Membership...) sit on
  // a dark surface — this swaps label/prefix text to a light color rather
  // than requiring every call site to override styles individually.
  labelColor?: string;
};

export function TextField({ label, prefix, labelColor, style, ...inputProps }: TextFieldProps) {
  return (
    <View style={styles.container}>
      {!!label && <Text style={[styles.label, labelColor ? { color: labelColor } : undefined]}>{label}</Text>}
      <View style={styles.inputRow}>
        {prefix && (
          <View style={[styles.prefix, style && { borderColor: (style as { borderColor?: string }).borderColor }]}>
            <Text style={[styles.prefixText, labelColor ? { color: labelColor } : undefined]}>{prefix}</Text>
          </View>
        )}
        <TextInput
          style={[styles.input, prefix ? styles.inputWithPrefix : undefined, style]}
          placeholderTextColor={colors.textMuted}
          {...inputProps}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  prefix: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  prefixText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  inputWithPrefix: {
    flex: 1,
  },
});
