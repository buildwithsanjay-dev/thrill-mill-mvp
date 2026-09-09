import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
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
import { formatBookingDate, formatSlotTime } from '@/utils/datetime';
import { updateMyProfile, uploadAvatar, type Profile } from '../api';
import { profileQueryKey, useProfile } from '../useProfile';

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

  const avatarPreviewUri = pickedImageUri ?? profile.avatar_url ?? undefined;
  const isDirty =
    pickedImageUri !== null ||
    fullName.trim() !== (profile.full_name ?? '') ||
    phone.trim() !== (profile.phone?.replace(/^\+91/, '') ?? '');

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to update your profile picture.');
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
    if (!fullName.trim()) {
      Alert.alert('Name required', 'Please enter your full name.');
      return;
    }
    setIsSaving(true);
    try {
      let avatarUrl = profile.avatar_url ?? undefined;
      if (pickedImageUri) {
        avatarUrl = await uploadAvatar(pickedImageUri);
      }
      await updateMyProfile({
        full_name: fullName.trim(),
        phone: phone.trim() ? `+91${phone.trim()}` : undefined,
        avatar_url: avatarUrl,
      });
      if (session?.user.id) {
        await queryClient.invalidateQueries({ queryKey: profileQueryKey(session.user.id) });
      }
      setPickedImageUri(null);
      Alert.alert('Saved', 'Your profile has been updated.');
    } catch (error) {
      Alert.alert('Could not save', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Sign out?', 'You can sign back in anytime.', [
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
            Alert.alert('Sign out failed', error instanceof Error ? error.message : 'Please try again.');
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

        {profile.platform_role === 'ADMIN' && (
          <View style={styles.adminBadgeWrap}>
            <Badge label="ADMIN" tone="host" />
          </View>
        )}

        <View style={styles.form}>
          <TextField label="Full Name" placeholder="Your name" value={fullName} onChangeText={setFullName} />
          <View style={{ height: spacing.md }} />
          <TextField
            label="Mobile Number"
            prefix="+91"
            placeholder="00000 00000"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
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
      </ScrollView>
    </SafeAreaView>
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
