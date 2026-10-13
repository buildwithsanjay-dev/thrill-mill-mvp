import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { Mascot } from '@/components/Mascot';
import type { MascotPose } from '@/constants/mascotAssets';
import { colors, radii, spacing, themedStyles } from '@/constants/theme';
import { useProfile } from '@/features/profile/useProfile';
import { resolveNotificationRoute } from '../api';
import { useMarkNotificationRead, useMyNotifications } from '../useNotifications';

type Kind = 'success' | 'brand' | 'danger' | 'warning';

// `face` is the always-on mascot face per docs/seasonal-theming/mascot.md's
// "In-app notification list (bell)" table — this isn't Halloween-specific,
// the mascot shows year-round in whatever costume is currently active.
// Mapped to the 9 face poses that actually exist (face-smile, face-wink,
// face-excited, face-surprised, face-thinking, face-laughing, face-sad,
// face-worried, face-sleepy) — mascot.md's planning table used a couple of
// friendlier names ("delighted", "heads-up") that were never generated as
// separate files, so those map to the closest sliced pose instead.
const TYPE_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; kind: Kind; face: MascotPose }> = {
  BOOKING_CONFIRMED: { icon: 'calendar', kind: 'success', face: 'face-excited' },
  SLOT_BOOKED: { icon: 'football', kind: 'brand', face: 'face-smile' },
  BOOKING_PENDING_REVIEW: { icon: 'help-circle', kind: 'warning', face: 'face-thinking' },
  ADDED_TO_BOOKING: { icon: 'person-add', kind: 'brand', face: 'face-wink' },
  BOOKING_CANCELLED: { icon: 'close-circle', kind: 'danger', face: 'face-sad' },
  GAME_REMINDER: { icon: 'alarm', kind: 'warning', face: 'face-excited' },
  MEMBERSHIP_APPROVED: { icon: 'ribbon', kind: 'success', face: 'face-laughing' },
  MEMBERSHIP_REQUESTED: { icon: 'document-text', kind: 'brand', face: 'face-thinking' },
  MEMBERSHIP_NEEDS_ATTENTION: { icon: 'alert-circle', kind: 'warning', face: 'face-worried' },
  JOIN_REQUEST_APPROVED: { icon: 'checkmark-circle', kind: 'success', face: 'face-laughing' },
  JOIN_REQUEST_REJECTED: { icon: 'close-circle', kind: 'danger', face: 'face-sad' },
  TEAM_INVITE: { icon: 'mail', kind: 'brand', face: 'face-wink' },
  TEAM_POLL: { icon: 'bar-chart', kind: 'brand', face: 'face-thinking' },
};

// One consistent set of tints for the whole list (built per render so it
// follows light/dark): success / brand teal / danger / warning only.
function typeStyle(type: string): { face: MascotPose; tint: string; bg: string } {
  const meta = TYPE_META[type] ?? { icon: 'notifications' as const, kind: 'brand' as const, face: 'face-smile' as const };
  const tones: Record<Kind, { tint: string; bg: string }> = {
    success: { tint: colors.success, bg: colors.successSoft },
    brand: { tint: colors.primary, bg: colors.primarySoft },
    danger: { tint: colors.danger, bg: colors.dangerSoft },
    warning: { tint: colors.warning, bg: colors.warningSoft },
  };
  return { face: meta.face, ...tones[meta.kind] };
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
          mascot="napping"
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
                <Mascot pose={typeStyle(n.type).face} size={26} />
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
