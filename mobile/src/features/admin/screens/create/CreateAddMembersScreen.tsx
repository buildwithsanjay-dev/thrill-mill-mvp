import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { StepIndicator } from '@/components/StepIndicator';
import { TextField } from '@/components/TextField';
import { colors, radii, spacing } from '@/constants/theme';
import { useAdminTeamWizard } from '@/stores/adminTeamWizard';
import { adminAddTeamMember, adminSearchMembers, type AdminMemberSearchResult } from '../../api';

const STEPS = ['DETAILS', 'MEMBERS', 'ROLES', 'MEMBERSHIP', 'REVIEW'];
const MAX_MEMBERS = 10;

export function CreateAddMembersScreen() {
  const router = useRouter();
  const { teamName, teamId, members, addMember, removeMemberId } = useAdminTeamWizard();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminMemberSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) router.replace('/(admin)/team/create');
  }, [teamId, router]);

  if (!teamId) return null;

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (!text.trim()) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const rows = await adminSearchMembers(text.trim());
      setResults(rows.filter((r) => !members.some((m) => m.id === r.id)));
    } catch (error) {
      Alert.alert('Search failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleAdd = async (user: AdminMemberSearchResult) => {
    if (members.length >= MAX_MEMBERS) {
      Alert.alert('Team is full', `A Team can have up to ${MAX_MEMBERS} playing members.`);
      return;
    }
    setAddingId(user.id);
    try {
      const teamMemberId = await adminAddTeamMember(teamId, user.id);
      addMember({ ...user, teamMemberId });
      setResults((prev) => prev.filter((r) => r.id !== user.id));
    } catch (error) {
      Alert.alert('Could not add member', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setAddingId(null);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Add Members</Text>
        <View style={{ width: 22 }} />
      </View>
      <Text style={styles.headerSubtitle}>Add registered members to this Team</Text>

      <View style={styles.stepMeta}>
        <Text style={styles.stepMetaLabel}>STEP 2 OF 5</Text>
        <Text style={styles.stepMetaValue}>MEMBERSHIP</Text>
      </View>
      <View style={styles.stepRow}>
        <StepIndicator steps={STEPS} activeIndex={1} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.creatingCard}>
          <View style={styles.creatingIcon}>
            <Ionicons name="git-network" size={16} color="#FFFFFF" />
          </View>
          <View style={{ marginLeft: spacing.sm }}>
            <Text style={styles.creatingLabel}>CREATING NEW TEAM</Text>
            <Text style={styles.creatingName}>{teamName}</Text>
          </View>
        </View>

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Selected Members</Text>
          <View style={styles.countPill}>
            <Text style={styles.countPillText}>{members.length}</Text>
          </View>
        </View>

        <View style={styles.selectedRow}>
          {members.map((m) => (
            <View key={m.id} style={styles.selectedChip}>
              <Avatar uri={m.avatar_url} name={m.full_name} size={44} />
              <Pressable style={styles.removeBadge} onPress={() => removeMemberId(m.id)}>
                <Ionicons name="close" size={10} color="#FFFFFF" />
              </Pressable>
              <Text style={styles.selectedName} numberOfLines={1}>
                {m.full_name?.split(' ')[0] ?? 'Member'}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle2}>Add More Members</Text>
        <Text style={styles.sectionSubtitle}>Search and select existing Thrill Mill members</Text>

        <TextField
          placeholder="Search by member name or phone number"
          value={query}
          onChangeText={handleSearch}
        />

        {isSearching && <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} />}

        {results.map((user) => (
          <View key={user.id} style={styles.resultRow}>
            <Avatar uri={user.avatar_url} name={user.full_name} size={40} />
            <View style={{ flex: 1, marginLeft: spacing.sm }}>
              <Text style={styles.resultName}>{user.full_name ?? 'Thrill Mill Member'}</Text>
              <Text style={styles.resultMeta}>Thrill Mill Member</Text>
            </View>
            <Pressable style={styles.addButton} onPress={() => handleAdd(user)} disabled={addingId === user.id}>
              {addingId === user.id ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <>
                  <Ionicons name="add" size={14} color={colors.text} />
                  <Text style={styles.addButtonLabel}>Add</Text>
                </>
              )}
            </Pressable>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerHint}>
          {members.length} Members Selected. You can assign the Host and Co-host in the next step.
        </Text>
        <Button title="Continue to Assign Roles" iconRight="arrow-forward" onPress={() => router.push('/(admin)/team/create-roles')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  headerSubtitle: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: 2 },
  stepMeta: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  stepMetaLabel: { fontSize: 11, fontWeight: '700', color: colors.primary, letterSpacing: 0.4 },
  stepMetaValue: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.4 },
  stepRow: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },

  creatingCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  creatingIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#0F1729', alignItems: 'center', justifyContent: 'center' },
  creatingLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3 },
  creatingName: { fontSize: 14, fontWeight: '800', color: colors.text, marginTop: 2 },

  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xl },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  sectionTitle2: { fontSize: 15, fontWeight: '800', color: colors.text, marginTop: spacing.xl },
  sectionSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md },
  countPill: { backgroundColor: colors.primary, borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  countPillText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },

  selectedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  selectedChip: { alignItems: 'center', width: 60 },
  removeBadge: {
    position: 'absolute',
    top: -4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedName: { fontSize: 11, fontWeight: '600', color: colors.text, marginTop: 4 },

  resultRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: radii.md, padding: spacing.sm, marginTop: spacing.sm, borderWidth: 1, borderColor: colors.border },
  resultName: { fontSize: 14, fontWeight: '700', color: colors.text },
  resultMeta: { fontSize: 11, color: colors.primary, marginTop: 2 },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  addButtonLabel: { fontSize: 12, fontWeight: '700', color: colors.text },

  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
  footerHint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
});
