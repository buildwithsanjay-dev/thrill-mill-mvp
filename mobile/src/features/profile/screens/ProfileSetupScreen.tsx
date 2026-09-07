import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { PaginationDots } from '@/components/PaginationDots';
import { colors, spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { updateMyProfile, uploadAvatar, type Profile } from '../api';
import { profileQueryKey, useProfile } from '../useProfile';

export function ProfileSetupScreen() {
  const { data: profile, isPending } = useProfile();

  // Wait for the profile row to load before mounting the form: its local
  // state (name/phone inputs) initializes once from `profile` on mount, so
  // the form must not exist yet while that data is still in flight.
  if (isPending || !profile) {
    return <View style={styles.container} />;
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

  const avatarPreviewUri = pickedImageUri ?? profile.avatar_url ?? undefined;

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to set a profile picture.');
      return;
    }
    // See ProfileScreen.tsx's pickImage for why `allowsEditing`/`aspect`
    // (the native "Crop" screen) was removed: it's not reliably functional
    // across Android versions and its label isn't controllable from JS, so
    // we skip straight to using the picked image — our avatar preview
    // already frames it consistently via `contentFit: 'cover'`.
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPickedImageUri(result.assets[0].uri);
    }
  };

  const finishOnboarding = async (fields: { full_name?: string; phone?: string; avatar_url?: string }) => {
    await updateMyProfile({ ...fields, onboarded_at: new Date().toISOString() });
    if (session?.user.id) {
      await queryClient.invalidateQueries({ queryKey: profileQueryKey(session.user.id) });
    }
    router.replace('/(auth)/ready-to-play');
  };

  const handleContinue = async () => {
    if (!fullName.trim()) {
      Alert.alert('Name required', 'Please enter your full name to continue.');
      return;
    }
    setIsSaving(true);
    try {
      let avatarUrl = profile.avatar_url ?? undefined;
      if (pickedImageUri) {
        avatarUrl = await uploadAvatar(pickedImageUri);
      }
      await finishOnboarding({
        full_name: fullName.trim(),
        phone: phone.trim() ? `+91${phone.trim()}` : undefined,
        avatar_url: avatarUrl,
      });
    } catch (error) {
      Alert.alert('Could not save profile', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    setIsSaving(true);
    try {
      await finishOnboarding({});
    } catch (error) {
      Alert.alert('Something went wrong', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Pressable onPress={handleSkip} hitSlop={12} disabled={isSaving}>
          <Text style={styles.skip}>Skip</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>Let&apos;s set up your profile</Text>
      <Text style={styles.subtitle}>Tell us a bit about yourself to personalize your club experience.</Text>

      <Pressable onPress={pickImage} style={styles.avatarWrap}>
        <View style={styles.avatarCircle}>
          {avatarPreviewUri ? (
            <Image source={{ uri: avatarPreviewUri }} style={styles.avatarImage} contentFit="cover" />
          ) : (
            <Ionicons name="image-outline" size={28} color={colors.textMuted} />
          )}
        </View>
        <View style={styles.avatarAddBadge}>
          <Ionicons name="add" size={16} color={colors.white} />
        </View>
      </Pressable>

      <View style={styles.form}>
        <TextField label="Full Name" placeholder="e.g. Sanjay PC" value={fullName} onChangeText={setFullName} />
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

      <View style={styles.footer}>
        <PaginationDots count={4} activeIndex={2} />
        <Button
          title={isSaving ? 'Saving…' : 'Continue'}
          iconRight={isSaving ? undefined : 'arrow-forward'}
          onPress={handleContinue}
          loading={isSaving}
        />
      </View>
    </SafeAreaView>
  );
}

const AVATAR_SIZE = 108;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  skip: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  title: {
    marginTop: spacing.lg,
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
    paddingHorizontal: spacing.md,
  },
  avatarWrap: {
    alignSelf: 'center',
    marginTop: spacing.xl,
  },
  avatarCircle: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarAddBadge: {
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
  form: {
    marginTop: spacing.xl,
  },
  footer: {
    marginTop: 'auto',
    marginBottom: spacing.lg,
    gap: spacing.lg,
  },
});
