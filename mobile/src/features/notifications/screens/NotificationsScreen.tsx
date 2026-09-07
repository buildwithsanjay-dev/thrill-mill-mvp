import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/EmptyState';
import { colors, radii, spacing } from '@/constants/theme';
import { useMarkNotificationRead, useMyNotifications } from '../useNotifications';

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
              onPress={() => !n.read_at && markRead(n.id)}
            >
              {!n.read_at && <View style={styles.unreadDot} />}
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
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardUnread: { borderColor: colors.primary },
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
