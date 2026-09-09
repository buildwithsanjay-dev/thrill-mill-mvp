import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FadeSlideIn } from '@/components/FadeSlideIn';
import { PaginationDots } from '@/components/PaginationDots';
import { colors, radii, spacing } from '@/constants/theme';
import { LogoBadge } from '../components/LogoBadge';
import { GradientButton } from '../components/GradientButton';

const HERO_IMAGE = require('../../../../assets/welcome-hero.webp');

export function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Image source={HERO_IMAGE} style={StyleSheet.absoluteFill} contentFit="cover" />

      {/* Top scrim so the status bar area stays legible over a bright sky,
          bottom scrim so the sheet edge blends into the photo instead of
          showing a hard seam. */}
      <LinearGradient
        colors={['rgba(9,15,25,0.55)', 'rgba(9,15,25,0)']}
        style={styles.topScrim}
      />
      <LinearGradient
        colors={['rgba(9,15,25,0)', 'rgba(9,15,25,0.65)', colors.background]}
        locations={[0, 0.6, 1]}
        style={styles.bottomScrim}
      />

      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.sheet}>
          <View style={styles.badgeWrap}>
            <LogoBadge size={92} ring />
          </View>

          <FadeSlideIn delay={80} style={{ width: '100%', alignItems: 'center' }}>
            <Text style={styles.title}>Play. Compete.{'\n'}Connect.</Text>
            <Text style={styles.subtitle}>
              Your sports club, community and games{'\n'}— all in one place.
            </Text>

            <View style={styles.ctaRow}>
              <GradientButton
                title="Get Started"
                iconRight="arrow-forward"
                onPress={() => router.push('/(auth)/sign-in')}
              />
            </View>

            <PaginationDots count={4} activeIndex={0} />
          </FadeSlideIn>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primaryDark,
  },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  bottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '58%',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.lg + 8,
    borderTopRightRadius: radii.lg + 8,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 10,
  },
  badgeWrap: {
    marginTop: -46,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 34,
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  ctaRow: {
    width: '100%',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
});
