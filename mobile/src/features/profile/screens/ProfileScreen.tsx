import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, radii, spacing } from '@/constants/theme';
import { signOut } from '@/features/auth/api';
import { useAuth } from '@/features/auth/AuthProvider';
import type { LeaderboardPeriod } from '@/features/leaderboard/api';
import { useMyCreditUsageLog } from '@/features/leaderboard/useLeaderboard';
import { registerForPushNotificationsAsync } from '@/features/notifications/pushToken';
import { formatBookingDate, formatSlotTime } from '@/utils/datetime';
import { REVIEW_URL } from '@/constants/links';
import { cleanPhoneDigits, validateFullName, validatePhone } from '@/lib/validation';
import { deleteMyAccount, isPhoneAvailable, removeAvatar, updateMyProfile, uploadAvatar, type Profile } from '../api';
import { profileQueryKey, useProfile } from '../useProfile';
import { showAlert } from '@/components/AppDialog';
import { friendlyError } from '@/lib/errors';

export function ProfileScreen() {
  const { data: profile, isPending } = useProfile();

  if (isPending || !profile) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  return <ProfileForm profile={profile} />;
}

function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const [fullName, setFullName] = useState(profile.full_name ?? '');
  const [phone, setPhone] = useState(profile.phone?.replace(/^\+91/, '') ?? '');
  const [pickedImageUri, setPickedImageUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [isRemovingPhoto, setIsRemovingPhoto] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const avatarPreviewUri = pickedImageUri ?? profile.avatar_url ?? undefined;
  const isDirty =
    pickedImageUri !== null ||
    fullName.trim() !== (profile.full_name ?? '') ||
    phone.trim() !== (profile.phone?.replace(/^\+91/, '') ?? '');

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert('Permission needed', 'Allow photo access to update your profile picture.');
      return;
    }
    // NOTE: `allowsEditing`/`aspect` would delegate to the OS's native image
    // editor for a "crop" step, but that native screen's confirm action
    // (labeled "Crop" on Android) is not reliable across Android versions —
    // notably Android 13+'s system Photo Picker does not support in-picker
    // editing at all, so the "Crop" screen either doesn't appear or its
    // confirm button just returns the original, uncropped image (behaves
    // like "Done", not "Crop"). expo-image-picker has no JS-level control
    // over that native screen's label, so rather than show a step that
    // falsely promises cropping, we skip it entirely: the picked image is
    // used as-is, and framing to a square/circle is handled consistently by
    // our own avatar preview (`contentFit: 'cover'` in a fixed-size circle).
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPickedImageUri(result.assets[0].uri);
    }
  };

  const handleSave = async () => {
    const nameProblem = validateFullName(fullName);
    const phoneProblem = validatePhone(phone);
    setNameError(nameProblem);
    setPhoneError(phoneProblem);
    if (nameProblem || phoneProblem) return;

    const e164 = `+91${cleanPhoneDigits(phone)}`;
    setIsSaving(true);
    try {
      if (e164 !== profile.phone && !(await isPhoneAvailable(e164))) {
        setPhoneError('This mobile number is already registered with another account.');
        return;
      }
      let avatarUrl = profile.avatar_url ?? undefined;
      if (pickedImageUri) {
        avatarUrl = await uploadAvatar(pickedImageUri);
      }
      await updateMyProfile({
        full_name: fullName.trim().replace(/\s+/g, ' '),
        phone: e164,
        avatar_url: avatarUrl,
      });
      if (session?.user.id) {
        await queryClient.invalidateQueries({ queryKey: profileQueryKey(session.user.id) });
      }
      setPickedImageUri(null);
      showAlert('Profile saved', 'Your details have been updated.');
    } catch (error) {
      showAlert('Could not save your profile', friendlyError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemovePhoto = () => {
    // A photo picked but not yet saved is just discarded locally.
    if (pickedImageUri) {
      setPickedImageUri(null);
      return;
    }
    showAlert(
      'Remove your profile picture?',
      'Your initials will be shown instead. You can add a new photo any time.',
      [
        { text: 'Keep photo', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setIsRemovingPhoto(true);
            try {
              await removeAvatar();
              if (session?.user.id) {
                await queryClient.invalidateQueries({ queryKey: profileQueryKey(session.user.id) });
              }
            } catch (error) {
              showAlert('Could not remove the photo', friendlyError(error));
            } finally {
              setIsRemovingPhoto(false);
            }
          },
        },
      ]
    );
  };

  const handleRateUs = async () => {
    try {
      await Linking.openURL(REVIEW_URL);
    } catch {
      showAlert('Could not open the review page', 'Check your internet connection and try again.');
    }
  };

  const handleDeleteAccount = () => {
    showAlert(
      'Delete your account?',
      'This signs you out everywhere and removes your name, phone number, photo and chat messages. Your team keeps its bookings and wallet history, shown under "Deleted user". This cannot be undone.',
      [
        { text: 'Keep my account', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              // Best-effort: the RPC anonymises the profile regardless.
              await removeAvatar().catch(() => undefined);
              await deleteMyAccount();
              await signOut().catch(() => undefined);
              router.replace('/(auth)/welcome');
              showAlert(
                'Account deleted',
                'Your Thrill Mill Club account has been deleted. Thank you for playing with us.',
                undefined,
                { variant: 'success' }
              );
            } catch (error) {
              showAlert('Could not delete your account', friendlyError(error));
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    showAlert('Sign out?', 'You can sign back in anytime.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          setIsSigningOut(true);
          try {
            await signOut();
            router.replace('/(auth)/welcome');
          } catch (error) {
            showAlert('Sign out failed', friendlyError(error));
            setIsSigningOut(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable onPress={pickImage} style={styles.avatarWrap}>
          <View style={styles.avatarCircle}>
            {avatarPreviewUri ? (
              <Image source={{ uri: avatarPreviewUri }} style={styles.avatarImage} contentFit="cover" />
            ) : (
              <Ionicons name="person-outline" size={32} color={colors.textMuted} />
            )}
          </View>
          <View style={styles.avatarEditBadge}>
            <Ionicons name="camera" size={14} color={colors.white} />
          </View>
        </Pressable>

        {avatarPreviewUri && (
          <Pressable onPress={handleRemovePhoto} disabled={isRemovingPhoto} style={styles.removePhoto}>
            {isRemovingPhoto ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <Text style={styles.removePhotoText}>Remove photo</Text>
            )}
          </Pressable>
        )}

        {profile.platform_role === 'ADMIN' && (
          <View style={styles.adminBadgeWrap}>
            <Badge label="ADMIN" tone="host" />
          </View>
        )}

        <View style={styles.form}>
          <TextField
            label="Full Name"
            placeholder="Your name"
            value={fullName}
            autoCapitalize="words"
            onChangeText={(v) => {
              setFullName(v);
              if (nameError) setNameError(undefined);
            }}
            error={nameError}
          />
          <View style={{ height: spacing.md }} />
          <TextField
            label="Mobile Number"
            prefix="+91"
            placeholder="00000 00000"
            keyboardType="number-pad"
            maxLength={10}
            value={phone}
            onChangeText={(v) => {
              setPhone(cleanPhoneDigits(v));
              if (phoneError) setPhoneError(undefined);
            }}
            error={phoneError}
          />
        </View>

        {isDirty && (
          <View style={{ marginTop: spacing.lg }}>
            <Button title={isSaving ? 'Saving…' : 'Save Changes'} onPress={handleSave} loading={isSaving} />
          </View>
        )}

        {/* Credit usage is per-member analytics (credits ÷ participants on
            games a member actually played) — an Admin is a platform
            operator, not a Team participant, so this concept doesn't apply
            to their own profile. */}
        {profile.platform_role !== 'ADMIN' && (
          <>
            <View style={styles.divider} />
            <CreditUsageSection />
          </>
        )}

        <View style={styles.divider} />

        <NotificationPermissionRow />

        <View style={styles.divider} />

        <Pressable style={styles.settingsRow} onPress={handleRateUs}>
          <Ionicons name="star-outline" size={20} color={colors.text} />
          <Text style={styles.settingsRowText}>Rate us on Google</Text>
          <Ionicons name="open-outline" size={16} color={colors.textMuted} />
        </Pressable>

        <View style={styles.divider} />

        <Pressable style={styles.signOutRow} onPress={handleSignOut} disabled={isSigningOut}>
          {isSigningOut ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={20} color={colors.danger} />
              <Text style={styles.signOutText}>Sign out</Text>
            </>
          )}
        </Pressable>

        {/* An Admin is a platform operator account, not a member account, so
            self-service deletion is not offered (the server refuses it too). */}
        {profile.platform_role !== 'ADMIN' && (
          <Pressable style={styles.deleteRow} onPress={handleDeleteAccount} disabled={isDeleting}>
            {isDeleting ? (
              <ActivityIndicator size="small" color={colors.danger} />
            ) : (
              <>
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                <Text style={styles.deleteText}>Delete account</Text>
              </>
            )}
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

type NotifPermState = 'checking' | 'granted' | 'denied-can-ask' | 'denied-permanent';

// The onboarding Permissions screen only ever appears once, for users who
// aren't onboarded yet — anyone already past that (or who tapped "Skip for
// now" there) has no other way to grant notification permission. Also
// covers Android's real platform behavior: once a user denies the OS
// permission dialog, a second requestPermissionsAsync() call is a silent
// no-op — canAskAgain becomes false, and the only way forward is the OS's
// own per-app settings page (Linking.openSettings()), never another
// in-app prompt.
function NotificationPermissionRow() {
  const [state, setState] = useState<NotifPermState>('checking');

  const refresh = async () => {
    const status = await Notifications.getPermissionsAsync();
    if (status.granted) setState('granted');
    else setState(status.canAskAgain ? 'denied-can-ask' : 'denied-permanent');
  };

  useEffect(() => {
    (async () => {
      await refresh();
    })();
  }, []);

  const handlePress = async () => {
    if (state === 'denied-can-ask') {
      await registerForPushNotificationsAsync();
      await refresh();
    } else if (state === 'denied-permanent') {
      await Linking.openSettings();
      // No listener for "returned from Settings" — refreshing next time
      // this screen is opened is enough; not required for correctness.
    }
  };

  if (state === 'checking') return null;

  return (
    <Pressable
      style={styles.settingsRow}
      onPress={state === 'granted' ? undefined : handlePress}
      disabled={state === 'granted'}
    >
      <Ionicons name="notifications-outline" size={20} color={colors.text} />
      <Text style={styles.settingsRowText}>Push Notifications</Text>
      {state === 'granted' ? (
        <View style={styles.grantedPill}>
          <Ionicons name="checkmark" size={12} color={colors.white} />
          <Text style={styles.grantedPillText}>Enabled</Text>
        </View>
      ) : (
        <Text style={styles.settingsRowAction}>
          {state === 'denied-permanent' ? 'Open Settings' : 'Enable'}
        </Text>
      )}
    </Pressable>
  );
}

// Per-member credit-usage log: `completed booking credits ÷ final
// participant count` per booking the caller played in, Week/Month
// filterable. Analytics only — this never represents a per-member wallet or
// a Team-wallet split (the Team's wallet is the only real balance).
function CreditUsageSection() {
  const [period, setPeriod] = useState<LeaderboardPeriod>('WEEK');
  const { data: rows, isPending } = useMyCreditUsageLog(period);

  return (
    <View style={styles.usageSection}>
      <View style={styles.usageHeaderRow}>
        <Text style={styles.usageTitle}>Credit Usage</Text>
        <View style={styles.usagePeriodTabs}>
          <Pressable
            style={[styles.usagePeriodTab, period === 'WEEK' && styles.usagePeriodTabActive]}
            onPress={() => setPeriod('WEEK')}
          >
            <Text style={[styles.usagePeriodLabel, period === 'WEEK' && styles.usagePeriodLabelActive]}>
              Week
            </Text>
          </Pressable>
          <Pressable
            style={[styles.usagePeriodTab, period === 'MONTH' && styles.usagePeriodTabActive]}
            onPress={() => setPeriod('MONTH')}
          >
            <Text style={[styles.usagePeriodLabel, period === 'MONTH' && styles.usagePeriodLabelActive]}>
              Month
            </Text>
          </Pressable>
        </View>
      </View>

      {isPending ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
      ) : !rows || rows.length === 0 ? (
        <Text style={styles.usageEmpty}>
          {period === 'WEEK' ? 'No games played this week yet.' : 'No games played this month yet.'}
        </Text>
      ) : (
        rows.map((row) => (
          <View key={row.booking_id} style={styles.usageRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.usageTeam} numberOfLines={1}>
                {row.team_name ?? 'Team'}
              </Text>
              <Text style={styles.usageMeta}>
                {formatBookingDate(row.booking_date)} • {formatSlotTime(row.start_time)}
                {' – '}
                {formatSlotTime(row.end_time)} • {row.participant_count_at_completion} players
              </Text>
            </View>
            <Text style={styles.usageCredits}>{Math.round(row.credits_attributed)}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const AVATAR_SIZE = 96;

const styles = StyleSheet.create({
  removePhoto: { alignSelf: 'center', marginTop: spacing.sm, padding: spacing.xs },
  removePhotoText: { fontSize: 13, fontWeight: '700', color: colors.danger },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  deleteText: { fontSize: 13, fontWeight: '700', color: colors.danger },
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl, alignItems: 'center' },

  avatarWrap: { marginTop: spacing.md },
  avatarCircle: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarEditBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.white,
  },
  adminBadgeWrap: { marginTop: spacing.sm },

  form: { width: '100%', marginTop: spacing.xl },
  divider: { width: '100%', height: 1, backgroundColor: colors.border, marginTop: spacing.xl, marginBottom: spacing.lg },
  signOutRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start' },
  signOutText: { fontSize: 15, fontWeight: '700', color: colors.danger },

  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, width: '100%' },
  settingsRowText: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  settingsRowAction: { fontSize: 13, fontWeight: '700', color: colors.primary },
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

  usageSection: { width: '100%' },
  usageHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  usageTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  usagePeriodTabs: { flexDirection: 'row', backgroundColor: '#EEF1F5', borderRadius: radii.pill, padding: 3 },
  usagePeriodTab: { paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radii.pill },
  usagePeriodTabActive: { backgroundColor: colors.primary },
  usagePeriodLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  usagePeriodLabelActive: { color: '#FFFFFF' },
  usageEmpty: { fontSize: 13, color: colors.textMuted, marginTop: spacing.md, textAlign: 'center' },
  usageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  usageTeam: { fontSize: 13, fontWeight: '700', color: colors.text },
  usageMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  usageCredits: { fontSize: 14, fontWeight: '800', color: colors.primary, marginLeft: spacing.sm },
});
