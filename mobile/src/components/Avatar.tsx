import { Text, View } from 'react-native';
import { Image } from 'expo-image';

import { colors, themedStyles } from '@/constants/theme';

type AvatarProps = {
  uri?: string | null;
  name?: string | null;
  size?: number;
};

// Brand-derived fills; white initials stay readable on every one, in both themes.
const PALETTE = ['#0E7C86', '#0B2545', '#EA5F14', '#2B6CB0', '#8A5A12', '#6B4EA0'];

function initials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name[0]!.toUpperCase();
}

function colorFor(name?: string | null): string {
  if (!name) return colors.textMuted;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function Avatar({ uri, name, size = 40 }: AvatarProps) {
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (uri) {
    return <Image source={{ uri }} style={dimension} contentFit="cover" />;
  }

  return (
    <View style={[styles.fallback, dimension, { backgroundColor: colorFor(name) }]}>
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
}));
