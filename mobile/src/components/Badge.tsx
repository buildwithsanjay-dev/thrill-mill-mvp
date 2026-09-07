import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/constants/theme';

type BadgeTone = 'host' | 'coHost' | 'member' | 'active' | 'pending' | 'danger' | 'neutral';

const TONE_STYLES: Record<BadgeTone, { bg: string; fg: string }> = {
  host: { bg: '#7C2D12', fg: '#FDBA74' },
  coHost: { bg: '#7C2D12', fg: '#FDBA74' },
  member: { bg: '#1E293B', fg: '#CBD5E1' },
  active: { bg: '#D1FAE5', fg: '#047857' },
  pending: { bg: '#FEF3C7', fg: '#92400E' },
  danger: { bg: '#FEE2E2', fg: '#B91C1C' },
  neutral: { bg: colors.border, fg: colors.text },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: BadgeTone }) {
  const toneStyle = TONE_STYLES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: toneStyle.bg }]}>
      <Text style={[styles.label, { color: toneStyle.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
});
