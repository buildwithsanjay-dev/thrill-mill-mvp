import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing } from '@/constants/theme';
import { resolveNotificationRoute } from '../api';
import { useMarkNotificationRead, useMyNotifications } from '../useNotifications';

type TypeStyle = { icon: keyof typeof Ionicons.glyphMap; tint: string; bg: string };

const TYPE_STYLES: Record<string, TypeStyle> = {
  BOOKING_CONFIRMED: { icon: 'calendar', tint: '#16A34A', bg: '#DCFCE7' },
  SLOT_BOOKED: { icon: 'football', tint: '#0C5C54', bg: '#DCEEE8' },
  ADDED_TO_BOOKING: { icon: 'person-add', tint: '#0C5C54', bg: '#DCEEE8' },
  BOOKING_CANCELLED: { icon: 'close-circle', tint: '#DC2626', bg: '#FEE2E2' },
  GAME_REMINDER: { icon: 'alarm', tint: '#D97706', bg: '#FEF3C7' },
  MEMBERSHIP_APPROVED: { icon: 'ribbon', tint: '#16A34A', bg: '#DCFCE7' },
  MEMBERSHIP_REQUESTED: { icon: 'document-text', tint: '#0C5C54', bg: '#DCEEE8' },
  MEMBERSHIP_NEEDS_ATTENTION: { icon: 'alert-circle', tint: '#D97706', bg: '#FEF3C7' },
  JOIN_REQUEST_APPROVED: { icon: 'checkmark-circle', tint: '#16A34A', bg: '#DCFCE7' },
  JOIN_REQUEST_REJECTED: { icon: 'close-circle', tint: '#DC2626', bg: '#FEE2E2' },
  TEAM_INVITE: { icon: 'mail', tint: '#0C5C54', bg: '#DCEEE8' },
  TEAM_POLL: { icon: 'bar-chart', tint: '#0C5C54', bg: '#DCEEE8' },
};
const DEFAULT_STYLE: TypeStyle = { icon: 'notifications', tint: '#0C5C54', bg: '#DCEEE8' };

export function NotificationsScreen() {
  const router = useRouter();
  const { data: notifications, isPending } = useMyNotifications();
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
                const route = resolveNotificationRoute(n.data);
                if (route) router.push(route);
              }}
            >
              {!n.read_at && <View style={styles.unreadDot} />}
              <View style={[styles.typeIcon, { backgroundColor: (TYPE_STYLES[n.type] ?? DEFAULT_STYLE).bg }]}>
                <Ionicons name={(TYPE_STYLES[n.type] ?? DEFAULT_STYLE).icon} size={20} color={(TYPE_STYLES[n.type] ?? DEFAULT_STYLE).tint} />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
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
    backgroundColor: '#FFFFFF',
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
});
