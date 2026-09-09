import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { StepIndicator } from '@/components/StepIndicator';
import { TextField } from '@/components/TextField';
import { darkColors, radii, spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCreateTeamWizard } from '@/stores/createTeamWizard';
import { inviteTeamMember, searchMembers, type LookupUserResult } from '../api';

const MAX_MEMBERS = 10;
const SEARCH_DEBOUNCE_MS = 300;

export function AddMembersScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { teamName, teamId, teamJoinCode, selectedMembers, addMember, removeMember } = useCreateTeamWizard();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LookupUserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guard against deep-linking straight into step 2 without step 1's
  // state — navigating during render (rather than in an effect) crashes
  // React Navigation with "Cannot update a component while rendering a
  // different component".
  useEffect(() => {
    if (!teamId) router.replace('/(app)/team/create');
  }, [teamId, router]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (query.trim().length < 2) {
        setResults([]);
        setHasSearched(false);
        return;
      }
      setIsSearching(true);
      try {
        const rows = await searchMembers(query.trim());
        setResults(rows.filter((r) => !selectedMembers.some((m) => m.id === r.id) && r.id !== session?.user.id));
      } catch (error) {
        Alert.alert('Search failed', error instanceof Error ? error.message : 'Please try again.');
      } finally {
        setIsSearching(false);
        setHasSearched(true);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  if (!teamId) return null;

  const handleInvite = async (user: LookupUserResult) => {
    if (user.id === session?.user.id) {
      Alert.alert('Already on the team', "You're the Host — no need to add yourself.");
      return;
    }
    if (selectedMembers.length >= MAX_MEMBERS - 1) {
      Alert.alert('Team is full', `A Team can have up to ${MAX_MEMBERS} playing members.`);
      return;
    }
    setInvitingId(user.id);
    try {
      const teamMemberId = await inviteTeamMember(teamId, user.id);
      addMember({ ...user, teamMemberId });
      setResults((prev) => prev.filter((r) => r.id !== user.id));
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes('TEAM_FULL')
          ? `A Team can have up to ${MAX_MEMBERS} playing members.`
          : error instanceof Error
            ? error.message
            : 'Please try again.';
      Alert.alert('Could not invite member', message);
    } finally {
      setInvitingId(null);
    }
  };

  const handleInviteByShare = async () => {
    try {
      await Share.share({
        message: `Join me on Thrill Mill Club! Download the app, sign in, then open "Join a Team" and enter this Team ID: ${teamJoinCode ?? ''}`,
      });
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={darkColors.text} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Add Members</Text>
          <Text style={styles.headerSubtitle}>{teamName}</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.stepRow}>
        <StepIndicator steps={['TEAM', 'MEMBERS', 'MEMBERSHIP']} activeIndex={1} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionTitle}>Build Your Team</Text>
        <Text style={styles.sectionSubtitle}>
          Search existing Thrill Mill members by name or phone number. You can add up to {MAX_MEMBERS} playing
          members.
        </Text>

        <View style={styles.searchRow}>
          <View style={{ flex: 1 }}>
            <TextField
              placeholder="Search by name or phone number"
              value={query}
              onChangeText={setQuery}
              style={styles.searchInput}
              placeholderTextColor={darkColors.textMuted}
            />
          </View>
          {isSearching && <ActivityIndicator size="small" color={darkColors.text} style={styles.searchSpinner} />}
        </View>

        {results.map((user) => (
          <View key={user.id} style={styles.resultRow}>
            <Avatar uri={user.avatar_url} name={user.full_name} size={40} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.resultName}>{user.full_name ?? 'Thrill Mill Member'}</Text>
              <Text style={styles.resultMeta}>Thrill Mill Member</Text>
            </View>
            <Pressable style={styles.addChip} onPress={() => handleInvite(user)} disabled={invitingId === user.id}>
              {invitingId === user.id ? (
                <ActivityIndicator size="small" color={darkColors.primaryLight} />
              ) : (
                <>
                  <Ionicons name="add" size={14} color={darkColors.primaryLight} />
                  <Text style={styles.addChipLabel}>ADD</Text>
                </>
              )}
            </Pressable>
          </View>
        ))}

        {hasSearched && !isSearching && results.length === 0 && (
          <View style={styles.inviteRow}>
            <Text style={styles.notFound}>No Thrill Mill member found matching &quot;{query.trim()}&quot;.</Text>
            <Pressable style={styles.inviteChip} onPress={handleInviteByShare}>
              <Ionicons name="paper-plane-outline" size={14} color={darkColors.primaryLight} />
              <Text style={styles.inviteChipLabel}>Invite them to Thrill Mill</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.subheading}>SELECTED MEMBERS</Text>
          <Text style={styles.counter}>
            {selectedMembers.length + 1} / {MAX_MEMBERS}
          </Text>
        </View>

        <View style={styles.memberRow}>
          <Avatar name="You" size={36} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Text style={styles.memberName}>You</Text>
              <Badge label="HOST" tone="host" />
            </View>
            <Text style={styles.memberStatus}>Team Host</Text>
          </View>
        </View>

        {selectedMembers.map((member) => (
          <View key={member.id} style={styles.memberRow}>
            <Avatar uri={member.avatar_url} name={member.full_name} size={36} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.memberName}>{member.full_name ?? 'Member'}</Text>
              <Text style={styles.memberStatus}>Invited — awaiting acceptance</Text>
            </View>
            <Pressable onPress={() => removeMember(member.id)} hitSlop={8}>
              <Ionicons name="close" size={18} color={darkColors.textMuted} />
            </Pressable>
          </View>
        ))}

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>TEAM SUMMARY</Text>
          <Text style={styles.summaryTeam}>{teamName}</Text>
          <Text style={styles.summaryMeta}>
            Members: {selectedMembers.length + 1} / {MAX_MEMBERS} · Host: You
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="Continue to Membership"
          iconRight="arrow-forward"
          onPress={() => router.push('/(app)/team/create-membership')}
        />
        <Text style={styles.footerHint}>You can manage your Team members later.</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: darkColors.background, paddingHorizontal: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  headerTitle: { fontSize: 16, fontWeight: '800', color: darkColors.text },
  headerSubtitle: { fontSize: 11, color: darkColors.textMuted, marginTop: 2 },
  stepRow: { alignItems: 'center', marginTop: spacing.lg },
  scroll: { paddingTop: spacing.lg, paddingBottom: spacing.lg },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: darkColors.text },
  sectionSubtitle: { fontSize: 13, color: darkColors.textMuted, marginTop: spacing.xs, lineHeight: 19 },

  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg },
  searchInput: { backgroundColor: darkColors.surface, borderColor: darkColors.border, color: darkColors.text },
  searchSpinner: { marginLeft: spacing.xs },
  notFound: { fontSize: 12, color: darkColors.danger, marginTop: spacing.sm },

  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: darkColors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  resultName: { fontSize: 14, fontWeight: '700', color: darkColors.text },
  resultMeta: { fontSize: 11, color: darkColors.textMuted, marginTop: 2 },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: darkColors.primaryLight,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  addChipLabel: { fontSize: 11, fontWeight: '800', color: darkColors.primaryLight },

  inviteRow: { marginTop: spacing.sm },
  inviteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: darkColors.primaryLight,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inviteChipLabel: { fontSize: 12, fontWeight: '700', color: darkColors.primaryLight },

  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
  },
  subheading: { fontSize: 11, fontWeight: '700', color: darkColors.textMuted, letterSpacing: 0.4 },
  counter: { fontSize: 11, fontWeight: '700', color: darkColors.primaryLight },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: darkColors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  memberName: { fontSize: 14, fontWeight: '700', color: darkColors.text },
  memberStatus: { fontSize: 11, color: darkColors.primaryLight, marginTop: 2 },

  summaryCard: {
    backgroundColor: darkColors.surfaceAlt,
    borderRadius: radii.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  summaryLabel: { fontSize: 10, fontWeight: '700', color: darkColors.textMuted, letterSpacing: 0.4 },
  summaryTeam: { fontSize: 15, fontWeight: '800', color: darkColors.text, marginTop: 4 },
  summaryMeta: { fontSize: 12, color: darkColors.textMuted, marginTop: 4 },

  footer: { paddingBottom: spacing.lg, paddingTop: spacing.sm },
  footerHint: { fontSize: 11, color: darkColors.textMuted, textAlign: 'center', marginTop: spacing.sm },
});
