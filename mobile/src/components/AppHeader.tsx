import type { PropsWithChildren } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing } from '@/constants/theme';
import { useProfile } from '@/features/profile/useProfile';
import { Avatar } from './Avatar';

// Shared across every (app) tab: tapping the avatar opens the Profile
// screen (edit details / sign out); the bell opens Notifications. Each tab
// supplies its own title/greeting as children so this stays presentational.
export function AppHeader({ children }: PropsWithChildren) {
  const router = useRouter();
  const { data: profile } = useProfile();

  return (
    <View style={styles.row}>
      <Pressable onPress={() => router.push('/(app)/profile')} hitSlop={8}>
        <Avatar uri={profile?.avatar_url} name={profile?.full_name} size={40} />
      </Pressable>
      <View style={styles.content}>{children}</View>
      <Pressable onPress={() => router.push('/(app)/notifications')} hitSlop={8}>
        <Ionicons name="notifications-outline" size={22} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  content: {
    flex: 1,
    marginHorizontal: spacing.sm,
  },
});
