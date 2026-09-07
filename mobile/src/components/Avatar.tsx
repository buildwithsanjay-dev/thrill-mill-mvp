import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { colors } from '@/constants/theme';

type AvatarProps = {
  uri?: string | null;
  name?: string | null;
  size?: number;
};

const PALETTE = ['#0C5C54', '#1D4ED8', '#B45309', '#7C3AED', '#BE123C', '#0369A1'];

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

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
