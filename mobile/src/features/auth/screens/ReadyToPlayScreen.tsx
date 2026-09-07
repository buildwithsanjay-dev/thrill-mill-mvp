import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PaginationDots } from '@/components/PaginationDots';
import { colors, spacing } from '@/constants/theme';
import { LogoBadge } from '../components/LogoBadge';

// The final step of onboarding, shown once right after profile setup
// completes (see ProfileSetupScreen). Not part of the (app)/index.tsx
// redirect gate — a user who backgrounds the app here and reopens it later
// lands straight in (app), never sees this screen twice.
export function ReadyToPlayScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <View style={styles.badgeWrap}>
          <LogoBadge size={104} />
          <View style={styles.checkBadge}>
            <Ionicons name="checkmark" size={16} color="#FFFFFF" />
          </View>
        </View>
        <Text style={styles.title}>You&apos;re ready to play.</Text>
        <Text style={styles.subtitle}>Join your Network, manage your games and book your Turf.</Text>
      </View>

      <View style={styles.footer}>
        <PaginationDots count={4} activeIndex={3} />
        <Button title="Enter Thrill Mill" iconRight="arrow-forward" onPress={() => router.replace('/')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badgeWrap: { position: 'relative' },
  checkBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  title: {
    marginTop: spacing.xl,
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
  footer: { gap: spacing.lg, paddingBottom: spacing.lg },
});
