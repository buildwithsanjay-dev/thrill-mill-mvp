import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FadeSlideIn } from '@/components/FadeSlideIn';
import { PaginationDots } from '@/components/PaginationDots';
import { colors, radii, spacing } from '@/constants/theme';
import { registerForPushNotificationsAsync } from '@/features/notifications/pushToken';
import { GradientButton } from '../components/GradientButton';

type GrantState = 'unknown' | 'granted' | 'not-granted';

// First stop after Sign In for anyone not yet onboarded (see app/index.tsx's
// redirect gate) — primes both permissions the app actually uses (push
// notifications; photo library for avatars/Team banners) with a plain-
// language reason BEFORE the raw OS dialog appears, rather than letting
// each permission ambush the user mid-feature the first time it's touched.
// Never a hard gate: "Skip for now" always proceeds, and declining either
// permission here never blocks anything later — the feature that actually
// needs it (booking confirmations, picking an avatar) just re-prompts or
// quietly does without, same as before this screen existed.
export function PermissionsScreen() {
  const router = useRouter();
  const [notificationsGranted, setNotificationsGranted] = useState<GrantState>('unknown');
  const [photosGranted, setPhotosGranted] = useState<GrantState>('unknown');
  const [isRequesting, setIsRequesting] = useState(false);
  const [isCheckingInitial, setIsCheckingInitial] = useState(true);

  const goToProfileSetup = () => router.replace('/(auth)/profile-setup');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Non-prompting checks only — never fire the OS dialog before the
      // user has actually seen this screen and tapped "Enable".
      const [notifStatus, photoStatus] = await Promise.all([
        Notifications.getPermissionsAsync(),
        ImagePicker.getMediaLibraryPermissionsAsync(),
      ]);
      if (cancelled) return;

      const notifGranted = notifStatus.status === 'granted';
      const photoGranted = photoStatus.granted;
      setNotificationsGranted(notifGranted ? 'granted' : 'not-granted');
      setPhotosGranted(photoGranted ? 'granted' : 'not-granted');

      // Both already settled (a returning user re-entering this step, or a
      // device that already granted everything) — nothing to prime, skip
      // straight through rather than show a screen with nothing to do.
      if (notifGranted && photoGranted) {
        goToProfileSetup();
        return;
      }
      setIsCheckingInitial(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEnable = async () => {
    setIsRequesting(true);
    try {
      // Handles its own permission request + token fetch + save — same
      // helper AuthProvider uses for a returning session, just invoked here
      // explicitly instead of automatically, so it only ever fires from a
      // screen that's already explained why.
      const pushResult = await registerForPushNotificationsAsync();
      if (pushResult.status === 'error') {
        // Distinct from simply declining (which the card's own "not
        // granted" state already communicates plainly, no extra copy
        // needed) — this is a real failure the user didn't choose, worth a
        // one-line heads-up. Fire-and-forget: still proceeds regardless,
        // same as every other outcome here.
        Alert.alert('Notifications could not be set up', 'You can try again later from your Profile.');
      }
      const notifStatus = await Notifications.getPermissionsAsync();
      setNotificationsGranted(notifStatus.status === 'granted' ? 'granted' : 'not-granted');

      const photoResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      setPhotosGranted(photoResult.granted ? 'granted' : 'not-granted');
    } finally {
      setIsRequesting(false);
      goToProfileSetup();
    }
  };

  if (isCheckingInitial) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <FadeSlideIn style={{ width: '100%', alignItems: 'center' }}>
          <Text style={styles.title}>Stay in the loop</Text>
          <Text style={styles.subtitle}>
            A couple of quick permissions make Thrill Mill Club work the way it should.
          </Text>

          <View style={styles.cardsWrap}>
            <PermissionCard
              icon="notifications-outline"
              title="Notifications"
              reason="Know the moment your booking is confirmed or your Team's membership is approved."
              state={notificationsGranted}
            />
            <PermissionCard
              icon="image-outline"
              title="Photos"
              reason="Set a profile picture and upload your Team's banner photo."
              state={photosGranted}
            />
          </View>
        </FadeSlideIn>
      </View>

      <View style={styles.footer}>
        <PaginationDots count={5} activeIndex={2} />
        <GradientButton
          title="Enable & Continue"
          iconRight="arrow-forward"
          onPress={handleEnable}
          loading={isRequesting}
        />
        <Text style={styles.skipLink} onPress={goToProfileSetup}>
          Skip for now
        </Text>
      </View>
    </SafeAreaView>
  );
}

function PermissionCard({
  icon,
  title,
  reason,
  state,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  reason: string;
  state: GrantState;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardIconWrap}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={styles.cardTextWrap}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          {state === 'granted' && (
            <View style={styles.grantedPill}>
              <Ionicons name="checkmark" size={12} color={colors.white} />
              <Text style={styles.grantedPillText}>Enabled</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardReason}>{reason}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: {
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
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  cardsWrap: {
    width: '100%',
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  cardIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: '#EAF5F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextWrap: { flex: 1 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardReason: { fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 17 },
  grantedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  grantedPillText: { fontSize: 10, fontWeight: '700', color: colors.white },
  footer: { gap: spacing.md, alignItems: 'center', paddingBottom: spacing.lg },
  skipLink: { fontSize: 13, fontWeight: '600', color: colors.textMuted, textDecorationLine: 'underline' },
});
