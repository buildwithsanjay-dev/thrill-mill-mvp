import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FadeSlideIn } from '@/components/FadeSlideIn';
import { PaginationDots } from '@/components/PaginationDots';
import { colors, spacing } from '@/constants/theme';
import { LogoBadge } from '../components/LogoBadge';
import { GradientButton } from '../components/GradientButton';

// The final step of onboarding, shown once right after profile setup
// completes (see ProfileSetupScreen). Not part of the (app)/index.tsx
// redirect gate — a user who backgrounds the app here and reopens it later
// lands straight in (app), never sees this screen twice.
export function ReadyToPlayScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Purely decorative concentric rings behind the badge — the "you're
          all set" celebratory moment. pointerEvents="none" so they never
          intercept touches meant for anything above/around them. */}
      <View pointerEvents="none" style={styles.ringField}>
        <View style={[styles.ring, styles.ringOuter]} />
        <View style={[styles.ring, styles.ringInner]} />
      </View>

      <View style={styles.content}>
        <FadeSlideIn distance={10} style={{ alignItems: 'center' }}>
          <View style={styles.badgeWrap}>
            <LogoBadge size={104} ring />
            <LinearGradient
              colors={[colors.primary, '#1BB6A6']}
              style={styles.checkBadge}
            >
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            </LinearGradient>
          </View>
        </FadeSlideIn>

        <FadeSlideIn delay={100} style={{ alignItems: 'center' }}>
          <Text style={styles.title}>You&apos;re ready to play.</Text>
          <Text style={styles.subtitle}>Join your Team, manage your games and book your Turf.</Text>
        </FadeSlideIn>
      </View>

      <View style={styles.footer}>
        <PaginationDots count={4} activeIndex={3} />
        <GradientButton title="Enter Thrill Mill" iconRight="arrow-forward" onPress={() => router.replace('/')} />
      </View>
    </SafeAreaView>
  );
}

const RING_COLOR = 'rgba(12, 92, 84, 0.08)';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  ringField: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: RING_COLOR,
  },
  ringOuter: { width: 320, height: 320 },
  ringInner: { width: 220, height: 220 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badgeWrap: { position: 'relative' },
  checkBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
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
