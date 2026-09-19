import type { PropsWithChildren } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors, spacing, themedStyles } from '@/constants/theme';
import { LogoBadge } from '@/features/auth/components/LogoBadge';
import { useProfile } from '@/features/profile/useProfile';
import { useHasUnreadNotifications } from '@/features/notifications/useNotifications';
import { Avatar } from './Avatar';

// The app's fixed top bar, shared by every tab: Thrill Mill logo + name on the
// left, notifications bell and your avatar (opens Profile) on the right. Screens
// place it OUTSIDE their ScrollView, so it stays put while the content scrolls.
// The logo and your picture sit at opposite ends on purpose — side by side they
// competed with each other.
export function AppHeader() {
  const router = useRouter();
  const { data: profile } = useProfile();
  const hasUnread = useHasUnreadNotifications();

  return (
    <View style={styles.bar}>
      <View style={styles.brand}>
        <LogoBadge size={32} />
        <Text style={styles.brandText}>Thrill Mill Club</Text>
      </View>
      <View style={styles.actions}>
        <Pressable onPress={() => router.push('/(app)/notifications')} hitSlop={8} style={styles.iconButton}>
          <Ionicons name="notifications-outline" size={22} color={colors.text} />
          {hasUnread && <View style={styles.notificationDot} />}
        </Pressable>
        <Pressable onPress={() => router.push('/(app)/(tabs)/profile')} hitSlop={8}>
          <Avatar uri={profile?.avatar_url} name={profile?.full_name} size={34} />
        </Pressable>
      </View>
    </View>
  );
}

// Per-screen title / greeting block, shown at the top of the scrolling content
// just under the fixed bar.
export function ScreenIntro({ children }: PropsWithChildren) {
  return <View style={styles.intro}>{children}</View>;
}

const styles = themedStyles(() => ({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  brandText: { fontSize: 17, fontWeight: '800', color: colors.text, letterSpacing: 0.1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  notificationDot: {
    position: 'absolute',
    top: 4,
    right: 5,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.accent,
    borderWidth: 1.5,
    borderColor: colors.background,
  },
  intro: { marginTop: spacing.md, marginBottom: spacing.lg },
}));
