import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, spacing } from '@/constants/theme';
import { respondToInvite } from '../api';
import { useInvalidateTeamQueries, useMyInvites } from '../useTeams';

// Surfaces on Home and My Teams: an invited (not-yet-ACTIVE) member
// otherwise had no way to even see they'd been invited, let alone accept —
// this was a real gap, not just a UI nicety.
export function PendingInvites() {
  const { data: invites, isPending } = useMyInvites();
  const invalidate = useInvalidateTeamQueries();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (isPending || !invites || invites.length === 0) return null;

  const handleRespond = async (teamMemberId: string, accept: boolean) => {
    setBusyId(teamMemberId);
    try {
      await respondToInvite(teamMemberId, accept);
      invalidate();
    } catch (error) {
      Alert.alert('Could not respond', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Ionicons name="mail-unread" size={16} color={colors.primary} />
        <Text style={styles.title}>Team Invitations</Text>
      </View>
      {invites.map((invite) => (
        <View key={invite.team_member_id} style={styles.card}>
          <Text style={styles.teamName}>{invite.team_name}</Text>
          <Text style={styles.subtitle}>invited you to join their Team</Text>
          <View style={styles.actionsRow}>
            <Pressable
              style={styles.declineButton}
              onPress={() => handleRespond(invite.team_member_id, false)}
              disabled={busyId === invite.team_member_id}
            >
              <Text style={styles.declineText}>Decline</Text>
            </Pressable>
            <Pressable
              style={styles.acceptButton}
              onPress={() => handleRespond(invite.team_member_id, true)}
              disabled={busyId === invite.team_member_id}
            >
              {busyId === invite.team_member_id ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.acceptText}>Accept</Text>
              )}
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.sm },
  title: { fontSize: 14, fontWeight: '800', color: colors.text },
  card: {
    backgroundColor: '#ECFDF5',
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  teamName: { fontSize: 15, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  declineButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    backgroundColor: '#FFFFFF',
  },
  declineText: { fontSize: 13, fontWeight: '700', color: colors.text },
  acceptButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  acceptText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
});
