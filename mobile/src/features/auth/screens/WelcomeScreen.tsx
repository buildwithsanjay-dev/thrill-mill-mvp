import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { PaginationDots } from '@/components/PaginationDots';
import { colors, spacing } from '@/constants/theme';
import { LogoBadge } from '../components/LogoBadge';

export function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      {/* TODO: replace with the real Turf photography from assets/ui/welcome.png
          once it's exported as a standalone image asset. */}
      <View style={styles.hero} />

      <SafeAreaView style={styles.content} edges={['bottom']}>
        <LogoBadge size={92} />
        <Text style={styles.title}>Play. Compete.{'\n'}Connect.</Text>
        <Text style={styles.subtitle}>
          Your sports club, community and games{'\n'}— all in one place.
        </Text>

        <View style={styles.ctaRow}>
          <Button
            title="Get Started"
            iconRight="arrow-forward"
            onPress={() => router.push('/(auth)/sign-in')}
          />
        </View>

        <PaginationDots count={4} activeIndex={0} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    height: '42%',
    backgroundColor: colors.primaryDark,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginTop: -48,
  },
  title: {
    marginTop: spacing.lg,
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
    marginTop: 'auto',
    marginBottom: spacing.lg,
  },
});
