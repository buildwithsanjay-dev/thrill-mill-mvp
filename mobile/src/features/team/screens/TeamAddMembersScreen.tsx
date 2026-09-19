import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { showAlert } from '@/components/AppDialog';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { TextField } from '@/components/TextField';
import { colors, radii, spacing } from '@/constants/theme';
import { friendlyError } from '@/lib/errors';
import { inviteTeamMember, searchMembers, type LookupUserResult } from '../api';
import { buildInviteMessage } from '../invite';
import { useInvalidateTeamQueries, useTeamDetails } from '../useTeams';

const MAX_MEMBERS = 10;
const SEARCH_DEBOUNCE_MS = 300;

// "Add members" for a Team that already exists (the create-team wizard's
// Add Members step only runs once, at creation). Reachable from Team Details
// for the Host/Co-host (and the Admin); fn_invite_team_member independently
// enforces that, plus the 10-member cap, so hiding the button is UX only.
export function TeamAddMembersScreen() {
  const router = useRouter();
  const { id: teamId } = useLocalSearchParams<{ id: string }>();
  const { data: details } = useTeamDetails(teamId);
  const invalidate = useInvalidateTeamQueries();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LookupUserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const members = details?.members ?? [];
  const onTeamIds = new Set(members.filter((m) => ['ACTIVE', 'INVITED', 'PENDING'].includes(m.status)).map((m) => m.user_id));
  const activeCount = members.filter((m) => m.status === 'ACTIVE').length;
  const invitedCount = members.filter((m) => m.status === 'INVITED').length;

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
        setResults(rows);
      } catch (error) {
        showAlert('Search failed', friendlyError(error));
      } finally {
        setIsSearching(false);
        setHasSearched(true);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const handleInvite = async (user: LookupUserResult) => {
    if (!teamId) return;
    if (activeCount + invitedCount >= MAX_MEMBERS) {
      showAlert('Team is full', `A team can have up to ${MAX_MEMBERS} members, including pending invites.`);
      return;
    }
    setInvitingId(user.id);
    try {
      await inviteTeamMember(teamId, user.id);
      invalidate(teamId);
      showAlert('Invite sent', `${user.full_name ?? 'The member'} has been invited. They join the team once they accept.`);
    } catch (error) {
      showAlert('Could not add member', friendlyError(error));
    } finally {
      setInvitingId(null);
    }
  };

  const handleShare = async () => {
    if (!details) return;
    try {
      await Share.share({ message: buildInviteMessage(details.team.name, details.team.join_code) });
    } catch {
      // Share sheet dismissed — nothing to do.
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Add Members</Text>
          <Text style={styles.headerSubtitle}>{details?.team.name ?? ''}</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionSubtitle}>
          Search existing Thrill Mill members by name or phone number. A team holds up to {MAX_MEMBERS} members
          ({activeCount + invitedCount} used, including pending invites).
        </Text>

        <View style={styles.searchRow}>
          <View style={{ flex: 1 }}>
            <TextField placeholder="Search by name or phone number" value={query} onChangeText={setQuery} />
          </View>
          {isSearching && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: spacing.sm }} />}
        </View>

        {results.map((user) => {
          const alreadyOn = onTeamIds.has(user.id);
          return (
            <View key={user.id} style={styles.row}>
              <Avatar uri={user.avatar_url} name={user.full_name} size={40} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.name}>{user.full_name ?? 'Thrill Mill Member'}</Text>
                <Text style={styles.meta}>{alreadyOn ? 'Already on this team' : 'Thrill Mill Member'}</Text>
              </View>
              {!alreadyOn && (
                <Pressable style={styles.addChip} onPress={() => handleInvite(user)} disabled={invitingId === user.id}>
                  {invitingId === user.id ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Ionicons name="add" size={14} color={colors.primary} />
                      <Text style={styles.addChipLabel}>ADD</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          );
        })}

        {hasSearched && !isSearching && results.length === 0 && (
          <View style={styles.notFoundBox}>
            <Text style={styles.notFound}>No Thrill Mill member found matching &quot;{query.trim()}&quot;.</Text>
            <Pressable style={styles.addChip} onPress={handleShare}>
              <Ionicons name="paper-plane-outline" size={14} color={colors.primary} />
              <Text style={styles.addChipLabel}>Invite them to Thrill Mill</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.subheading}>CURRENT TEAM</Text>
          <Text style={styles.counter}>{activeCount} active</Text>
        </View>

        {members
          .filter((m) => ['ACTIVE', 'INVITED'].includes(m.status))
          .map((m) => (
            <View key={m.id} style={styles.row}>
              <Avatar uri={m.profile?.avatar_url} name={m.profile?.full_name} size={36} />
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.name}>{m.profile?.full_name ?? 'Member'}</Text>
                <Text style={styles.meta}>{m.status === 'INVITED' ? 'Invited — awaiting acceptance' : 'Active'}</Text>
              </View>
              {m.team_role !== 'MEMBER' && <Badge label={m.team_role === 'HOST' ? 'HOST' : 'CO-HOST'} tone={m.team_role === 'HOST' ? 'host' : 'coHost'} />}
            </View>
          ))}

        <Pressable style={styles.shareRow} onPress={handleShare}>
          <Ionicons name="share-social-outline" size={18} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.name}>Share the team link</Text>
            <Text style={styles.meta}>Anyone can join with Team ID {details?.team.join_code ?? ''} (you approve them).</Text>
          </View>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  headerSubtitle: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  scroll: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  sectionSubtitle: { fontSize: 13, color: colors.textMuted, lineHeight: 19, marginBottom: spacing.md },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  meta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: radii.pill,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
  },
  addChipLabel: { fontSize: 12, fontWeight: '800', color: colors.primary },
  notFoundBox: { alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.md },
  notFound: { fontSize: 13, color: colors.textMuted },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, marginBottom: spacing.sm },
  subheading: { fontSize: 11, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.4 },
  counter: { fontSize: 11, fontWeight: '700', color: colors.primary },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: '#ECFDF5',
  },
});
