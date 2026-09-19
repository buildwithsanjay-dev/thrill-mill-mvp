import { Text, View } from 'react-native';

import { colors, radii, spacing, themedStyles } from '@/constants/theme';

type BadgeTone = 'host' | 'coHost' | 'member' | 'active' | 'pending' | 'danger' | 'neutral';

// Built per render (not a module constant) so the tones follow light/dark.
function toneStyles(): Record<BadgeTone, { bg: string; fg: string }> {
  return {
    host: { bg: colors.hero, fg: colors.heroText },
    coHost: { bg: colors.primarySoft, fg: colors.primary },
    member: { bg: colors.surfaceAlt, fg: colors.textMuted },
    active: { bg: colors.successSoft, fg: colors.success },
    pending: { bg: colors.warningSoft, fg: colors.warningText },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
    neutral: { bg: colors.border, fg: colors.text },
  };
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const toneStyle = toneStyles()[tone];
  return (
    <View style={[styles.badge, { backgroundColor: toneStyle.bg }]}>
      <Text style={[styles.label, { color: toneStyle.fg }]}>{label}</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
}));
