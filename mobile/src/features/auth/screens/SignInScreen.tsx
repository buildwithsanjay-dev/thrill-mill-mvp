import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { PaginationDots } from '@/components/PaginationDots';
import { colors, spacing } from '@/constants/theme';
import { LogoBadge } from '../components/LogoBadge';
import { signInWithGoogle, signInWithUsername } from '../api';

// Note: the Figma design (assets/ui/Sign In.png) also shows a "Continue with
// Apple" option. Omitted here on purpose — CLAUDE.md scopes this MVP to
// Android-first with no public iOS release, and there's no Apple provider
// configured in Supabase, so a visible-but-non-functional button would be
// dead UI. Add it back when iOS is actually in scope.
export function SignInScreen() {
  const router = useRouter();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const goToApp = () => {
    // AuthProvider's onAuthStateChange has the new session by now, but this
    // screen won't navigate on its own — hand off to the root gate
    // (app/index.tsx) to decide between profile-setup and (app).
    router.replace('/');
  };

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    try {
      const session = await signInWithGoogle();
      if (!session) {
        // User cancelled the browser flow — no error to show.
        return;
      }
      goToApp();
    } catch (error) {
      Alert.alert(
        'Sign in failed',
        error instanceof Error ? error.message : 'Something went wrong. Please try again.'
      );
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleUsernameSignIn = async () => {
    if (!username.trim() || !password) {
      Alert.alert('Missing details', 'Enter both username and password.');
      return;
    }
    setIsSigningIn(true);
    try {
      await signInWithUsername(username, password);
      goToApp();
    } catch (error) {
      const message =
        error instanceof Error && error.message === 'UNKNOWN_USERNAME'
          ? 'Unknown username.'
          : 'Incorrect username or password.';
      Alert.alert('Sign in failed', message);
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={12}>
        <Ionicons name="arrow-back" size={22} color={colors.text} />
      </Pressable>

      {/* Without this, the admin username/password fields (which sit
          roughly mid-screen since `content` is vertically centered) could
          end up hidden behind the on-screen keyboard on shorter devices —
          nothing was shifting the layout up to keep the field being typed
          into visible. KeyboardAvoidingView does that shift; the ScrollView
          inside lets the form scroll into view too if it still doesn't
          fully fit above the keyboard. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <LogoBadge size={92} />
            <Text style={styles.title}>Welcome to{'\n'}Thrill Mill Club</Text>
            <Text style={styles.subtitle}>
              Sign in to manage your teams,{'\n'}games and Turf bookings.
            </Text>

            <View style={styles.buttonGroup}>
              <Button
                title="Continue with Google"
                iconLeft="logo-google"
                onPress={handleGoogleSignIn}
                loading={isSigningIn}
              />

              {showAdminForm ? (
                <View style={styles.adminForm}>
                  <TextField
                    label="Username"
                    placeholder="admin"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={username}
                    onChangeText={setUsername}
                  />
                  <View style={{ height: spacing.sm }} />
                  <TextField
                    label="Password"
                    placeholder="••••••••"
                    secureTextEntry
                    autoCapitalize="none"
                    value={password}
                    onChangeText={setPassword}
                  />
                  <View style={{ height: spacing.md }} />
                  <Button
                    title="Sign in"
                    variant="outline"
                    onPress={handleUsernameSignIn}
                    loading={isSigningIn}
                  />
                </View>
              ) : (
                <Pressable onPress={() => setShowAdminForm(true)} hitSlop={12} style={styles.adminLink}>
                  <Text style={styles.adminLinkText}>Sign in with username &amp; password</Text>
                </Pressable>
              )}
            </View>
          </View>

          <View style={styles.footer}>
            <PaginationDots count={4} activeIndex={1} />
            <Text style={styles.terms}>
              By signing in, you agree to our Terms of Service and Privacy Policy.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  backButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: spacing.lg,
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 32,
  },
  subtitle: {
    marginTop: spacing.sm,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  buttonGroup: {
    width: '100%',
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  adminLink: {
    alignSelf: 'center',
    marginTop: spacing.xs,
  },
  adminLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  adminForm: {
    width: '100%',
    marginTop: spacing.xs,
  },
  footer: {
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  terms: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.lg,
  },
});
