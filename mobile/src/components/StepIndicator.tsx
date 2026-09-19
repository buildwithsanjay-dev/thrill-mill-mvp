import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { screenColors, spacing, themedStyles } from '@/constants/theme';

export function StepIndicator({ steps, activeIndex }: { steps: string[]; activeIndex: number }) {
  return (
    <View style={styles.row}>
      {steps.map((step, index) => (
        <View key={step} style={styles.stepGroup}>
          {index > 0 && (
            <View
              style={[
                styles.connector,
                { backgroundColor: index <= activeIndex ? screenColors.primaryLight : screenColors.border },
              ]}
            />
          )}
          <View style={styles.step}>
            <View
              style={[
                styles.dot,
                index < activeIndex && styles.dotDone,
                index === activeIndex && styles.dotActive,
                index > activeIndex && styles.dotPending,
              ]}
            >
              {index < activeIndex ? (
                <Ionicons name="checkmark" size={14} color="#FFFFFF" />
              ) : (
                <View style={index === activeIndex ? styles.dotActiveInner : undefined} />
              )}
            </View>
            <Text style={[styles.label, index <= activeIndex && styles.labelActive]}>{step}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const DOT = 32;

const styles = themedStyles(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connector: {
    width: 28,
    height: 2,
    marginHorizontal: spacing.xs,
    marginBottom: 20,
  },
  step: {
    alignItems: 'center',
    width: 76,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  dotDone: {
    backgroundColor: screenColors.primaryLight,
  },
  dotActive: {
    borderWidth: 2,
    borderColor: screenColors.primaryLight,
    backgroundColor: screenColors.surface,
  },
  dotActiveInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: screenColors.primaryLight,
  },
  dotPending: {
    backgroundColor: screenColors.surfaceAlt,
    borderWidth: 1,
    borderColor: screenColors.border,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: screenColors.textMuted,
    letterSpacing: 0.4,
  },
  labelActive: {
    color: screenColors.text,
  },
}));
