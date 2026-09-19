import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing, themedStyles } from '@/constants/theme';
import { useProfile } from '@/features/profile/useProfile';
import { resolveNotificationRoute } from '../api';
import { useMarkNotificationRead, useMyNotifications } from '../useNotifications';

type Kind = 'success' | 'brand' | 'danger' | 'warning';

const TYPE_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; kind: Kind }> = {
  BOOKING_CONFIRMED: { icon: 'calendar', kind: 'success' },
  SLOT_BOOKED: { icon: 'football', kind: 'brand' },
  ADDED_TO_BOOKING: { icon: 'person-add', kind: 'brand' },
  BOOKING_CANCELLED: { icon: 'close-circle', kind: 'danger' },
  GAME_REMINDER: { icon: 'alarm', kind: 'warning' },
  MEMBERSHIP_APPROVED: { icon: 'ribbon', kind: 'success' },
  MEMBERSHIP_REQUESTED: { icon: 'document-text', kind: 'brand' },
  MEMBERSHIP_NEEDS_ATTENTION: { icon: 'alert-circle', kind: 'warning' },
  JOIN_REQUEST_APPROVED: { icon: 'checkmark-circle', kind: 'success' },
  JOIN_REQUEST_REJECTED: { icon: 'close-circle', kind: 'danger' },
  TEAM_INVITE: { icon: 'mail', kind: 'brand' },
  TEAM_POLL: { icon: 'bar-chart', kind: 'brand' },
};

// One consistent set of tints for the whole list (built per render so it
// follows light/dark): success / brand teal / danger / warning only.
function typeStyle(type: string): { icon: keyof typeof Ionicons.glyphMap; tint: string; bg: string } {
  const meta = TYPE_META[type] ?? { icon: 'notifications' as const, kind: 'brand' as const };
  const tones: Record<Kind, { tint: string; bg: string }> = {
    success: { tint: colors.success, bg: colors.successSoft },
    brand: { tint: colors.primary, bg: colors.primarySoft },
    danger: { tint: colors.danger, bg: colors.dangerSoft },
    warning: { tint: colors.warning, bg: colors.warningSoft },
  };
  return { icon: meta.icon, ...tones[meta.kind] };
}

export function NotificationsScreen() {
  const router = useRouter();
  const { data: notifications, isPending } = useMyNotifications();
  const { data: profile } = useProfile();
  const markRead = useMarkNotificationRead();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 22 }} />
      </View>

      {isPending ? (
        <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.primary} />
      ) : !notifications || notifications.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="No notifications yet"
          message="Booking confirmations, membership updates and Team activity will show up here."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {notifications.map((n) => (
            <Pressable
              key={n.id}
              style={[styles.card, !n.read_at && styles.cardUnread]}
              onPress={() => {
                if (!n.read_at) markRead(n.id);
                const route = resolveNotificationRoute(n.data, profile?.platform_role === 'ADMIN');
                if (route) router.push(route);
              }}
            >
              {!n.read_at && <View style={styles.unreadDot} />}
              <View style={[styles.typeIcon, { backgroundColor: typeStyle(n.type).bg }]}>
                <Ionicons name={typeStyle(n.type).icon} size={20} color={typeStyle(n.type).tint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{n.title}</Text>
                {!!n.body && <Text style={styles.cardBody}>{n.body}</Text>}
                <Text style={styles.cardDate}>
                  {new Date(n.created_at).toLocaleDateString('en-IN', {
                    day: '2-digit',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },

  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardUnread: { borderColor: colors.primary },
  typeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  unreadDot: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.text, paddingRight: spacing.md },
  cardBody: { fontSize: 13, color: colors.textMuted, marginTop: 4 },
  cardDate: { fontSize: 11, color: colors.textMuted, marginTop: spacing.sm },
}));
