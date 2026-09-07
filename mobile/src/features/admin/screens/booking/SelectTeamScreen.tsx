import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { colors, radii, spacing } from '@/constants/theme';
import { useAdminBookingDraft } from '@/stores/adminBookingDraft';
import { findTeamByJoinCodeOrName } from '../../api';
import type { Team, TeamWallet } from '@/types/db';

export function SelectTeamScreen() {
  const router = useRouter();
  const { setTeam } = useAdminBookingDraft();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<(Team & { wallet: TeamWallet | null })[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selected, setSelected] = useState<(Team & { wallet: TeamWallet | null }) | null>(null);

  const handleSearch = async (text: string) => {
    setQuery(text);
    setSelected(null);
    if (!text.trim()) {
      setResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const rows = await findTeamByJoinCodeOrName(text.trim());
      setResults(rows);
    } catch (error) {
      Alert.alert('Search failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleContinue = () => {
    if (!selected) return;
    setTeam({
      id: selected.id,
      name: selected.name,
      joinCode: selected.join_code,
      walletCredits: selected.wallet?.available_credits ?? 0,
    });
    router.push('/(admin)/booking/create-slot');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>Create Booking</Text>
          <Text style={styles.headerSubtitle}>Select the Team for this booking.</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.stepMeta}>
        <Text style={styles.stepMetaLabel}>STEP 1 OF 2</Text>
        <Text style={styles.stepMetaValue}>SELECT TEAM</Text>
      </View>
      <View style={styles.progressBar}>
        <View style={styles.progressFillHalf} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.sectionTitle}>Find Network</Text>
        <Text style={styles.sectionSubtitle}>Enter the Network ID shared by the member or search for a Network.</Text>

        <TextField
          placeholder="TM-XXXXXX or Network ID"
          autoCapitalize="characters"
          value={query}
          onChangeText={handleSearch}
        />

        {isSearching && <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.primary} />}

        {results.map((team) => (
          <Pressable
            key={team.id}
            style={[styles.resultCard, selected?.id === team.id && styles.resultCardSelected]}
            onPress={() => setSelected(team)}
          >
            <View style={styles.resultTopRow}>
              <View style={styles.resultIcon}>
                <Ionicons name="shield" size={18} color={colors.textMuted} />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.sm }}>
                <Text style={styles.resultName}>{team.name}</Text>
                <Text style={styles.resultId}>{team.join_code}</Text>
              </View>
            </View>
            <View style={styles.resultBottomRow}>
              <View style={styles.activePlanChip}>
                <Text style={styles.activePlanChipText}>ACTIVE PLAN</Text>
              </View>
              <View>
                <Text style={styles.walletLabel}>Wallet Balance</Text>
                <Text style={styles.walletValue}>₹{Math.round(team.wallet?.available_credits ?? 0).toLocaleString()}</Text>
              </View>
            </View>
          </Pressable>
        ))}

        {query.trim() && !isSearching && results.length === 0 && (
          <Text style={styles.emptyText}>No active Network matches that search.</Text>
        )}

        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={16} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.infoTitle}>ADMIN-ASSISTED BOOKING</Text>
            <Text style={styles.infoBody}>
              The Admin can create a booking on behalf of an active Network. Booking price and credit
              deduction will be calculated automatically based on Network membership rules.
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button title="Continue to Select Slot" iconRight="arrow-forward" onPress={handleContinue} disabled={!selected} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  headerSubtitle: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  stepMeta: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  stepMetaLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.4 },
  stepMetaValue: { fontSize: 11, fontWeight: '700', color: colors.text, letterSpacing: 0.4 },
  progressBar: { height: 4, backgroundColor: colors.border, borderRadius: 2, marginHorizontal: spacing.lg, marginTop: spacing.sm, overflow: 'hidden' },
  progressFillHalf: { width: '50%', height: '100%', backgroundColor: colors.primary },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },

  sectionTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  sectionSubtitle: { fontSize: 13, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.md, lineHeight: 19 },

  resultCard: { backgroundColor: '#FFFFFF', borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.md, borderWidth: 1.5, borderColor: colors.border },
  resultCardSelected: { borderColor: colors.primary, backgroundColor: '#ECFDF5' },
  resultTopRow: { flexDirection: 'row', alignItems: 'center' },
  resultIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  resultName: { fontSize: 15, fontWeight: '800', color: colors.text },
  resultId: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  resultBottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  activePlanChip: { backgroundColor: '#FFEDD5', borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  activePlanChipText: { fontSize: 10, fontWeight: '800', color: '#9A3412' },
  walletLabel: { fontSize: 10, color: colors.textMuted, textAlign: 'right' },
  walletValue: { fontSize: 16, fontWeight: '800', color: colors.text, textAlign: 'right' },

  emptyText: { fontSize: 13, color: colors.textMuted, marginTop: spacing.md },

  infoCard: { flexDirection: 'row', backgroundColor: '#F8FAFC', borderRadius: radii.lg, padding: spacing.lg, marginTop: spacing.xl },
  infoTitle: { fontSize: 11, fontWeight: '800', color: colors.text, letterSpacing: 0.3 },
  infoBody: { fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 17 },

  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, paddingTop: spacing.sm },
});
