import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { colors, radii, spacing } from '@/constants/theme';
import { useAuth } from '@/features/auth/AuthProvider';
import { useTeamBookings } from '@/features/booking/useBooking';
import { useActiveTeamStore } from '@/stores/activeTeam';
import { formatBookingDate, formatSlotTime } from '@/utils/datetime';
import { assignCoHost, removeTeamMember, respondToJoinRequest, setTeamBanner, uploadTeamBanner } from '../api';
import { useInvalidateTeamQueries, useTeamBookingCounts, useTeamDetails } from '../useTeams';
import type { TeamMember, TeamRole } from '@/types/db';

const ROLE_TONE: Record<TeamRole, 'host' | 'coHost' | 'member'> = {
  HOST: 'host',
  CO_HOST: 'coHost',
  MEMBER: 'member',
};

export function TeamDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const { data, isPending, refetch } = useTeamDetails(id);
  const { data: bookings } = useTeamBookings(id);
  const { data: bookingCounts } = useTeamBookingCounts(id);
  const invalidate = useInvalidateTeamQueries();
  const setActiveTeamId = useActiveTeamStore((s) => s.setActiveTeamId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);

  if (isPending || !data) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  const { team, members, wallet, membership } = data;
  const activeMembers = members.filter((m) => m.status === 'ACTIVE');
  const invitedMembers = members.filter((m) => m.status === 'INVITED');
  const pendingRequests = members.filter((m) => m.status === 'PENDING');
  const myMembership = members.find((m) => m.user_id === session?.user.id);
  const isHostOrCoHost = myMembership?.team_role === 'HOST' || myMembership?.team_role === 'CO_HOST';
  // Banner edit is Host-only (narrower than the usual Host-or-Co-host rule) —
  // fn_set_team_banner and the team-banners storage RLS both independently
  // enforce this server-side; hiding the affordance here is UX only.
  const isHost = myMembership?.team_role === 'HOST';
  const upcoming = bookings?.find((b) => b.status === 'CONFIRMED');

  // react-native's built-in Share sheet (SMS/WhatsApp/anything) needs no
  // extra native module — unlike expo-clipboard, this works on an
  // already-built dev-client without a rebuild. It also doubles as the
  // "invite someone not on the app yet" flow: they get the Team ID and
  // instructions to enter it in Join a Team once they've signed up.
  const handleShareInvite = async () => {
    try {
      await Share.share({
        message: `Join my Thrill Mill Club Team "${team.name}"!\n\n1. Download Thrill Mill Club\n2. Sign in and open "Join a Team"\n3. Enter this Team ID: ${team.join_code}`,
      });
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  };

  const handleRespondToJoin = async (memberId: string, accept: boolean) => {
    setBusyId(memberId);
    try {
      await respondToJoinRequest(memberId, accept);
      invalidate(team.id);
      refetch();
    } catch (error) {
      Alert.alert('Action failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const handleMemberAction = (member: TeamMember) => {
    if (!isHostOrCoHost || member.team_role === 'HOST') return;
    const options: { text: string; onPress?: () => void; style?: 'destructive' | 'cancel' }[] = [];
    if (member.team_role !== 'CO_HOST' && myMembership?.team_role === 'HOST') {
      options.push({
        text: 'Make Co-Host',
        onPress: async () => {
          try {
            await assignCoHost(team.id, member.user_id);
            invalidate(team.id);
            refetch();
          } catch (error) {
            Alert.alert('Failed', error instanceof Error ? error.message : 'Please try again.');
          }
        },
      });
    }
    options.push({
      text: 'Remove from Team',
      style: 'destructive',
      onPress: async () => {
        try {
          await removeTeamMember(member.id);
          invalidate(team.id);
          refetch();
        } catch (error) {
          Alert.alert('Failed', error instanceof Error ? error.message : 'Please try again.');
        }
      },
    });
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(member.profile?.full_name ?? 'Member', undefined, options);
  };

  // Book Turf reads whichever Team is "active" (client-only UI state, see
  // stores/activeTeam.ts) — set it to the Team being viewed here first, so
  // booking from inside a Team's own page books for THAT Team, not
  // whatever was last selected on the dashboard.
  const handleBookTurf = () => {
    setActiveTeamId(team.id);
    router.push('/(app)/(tabs)/book');
  };

  const handleOpenChat = () => {
    router.push(`/(app)/team/${team.id}/chat`);
  };

  const handleEditBanner = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo access to set a Team banner.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      aspect: [16, 9],
    });
    if (result.canceled || !result.assets[0]) return;

    setIsUploadingBanner(true);
    try {
      const bannerUrl = await uploadTeamBanner(team.id, result.assets[0].uri);
      await setTeamBanner(team.id, bannerUrl);
      invalidate(team.id);
      refetch();
    } catch (error) {
      Alert.alert('Could not update banner', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setIsUploadingBanner(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{team.name}</Text>
          <View style={styles.activeDotRow}>
            <View style={styles.activeDot} />
            <Text style={styles.headerSubtitle}>ACTIVE TEAM</Text>
          </View>
        </View>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable
          style={styles.bannerWrap}
          onPress={isHost ? handleEditBanner : undefined}
          disabled={!isHost || isUploadingBanner}
        >
          {team.banner_url ? (
            <Image source={{ uri: team.banner_url }} style={styles.bannerImage} contentFit="cover" />
          ) : (
            <View style={styles.bannerPlaceholder}>
              <Ionicons name="image-outline" size={22} color="#94A3B8" />
              {isHost && <Text style={styles.bannerPlaceholderText}>Add a Team banner</Text>}
            </View>
          )}
          {isHost && (
            <View style={styles.bannerEditBadge}>
              {isUploadingBanner ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="camera" size={14} color="#FFFFFF" />
              )}
            </View>
          )}
        </Pressable>

        <View style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <View>
              <Text style={styles.summaryTeam}>{team.name}</Text>
              <Pressable style={styles.idRow} onPress={handleShareInvite}>
                <Text style={styles.idText} selectable>
                  ID: {team.join_code}
                </Text>
                <Ionicons name="share-outline" size={13} color={colors.textMuted} />
              </Pressable>
            </View>
            {myMembership && <Badge label={myMembership.team_role.replace('_', '-')} tone={ROLE_TONE[myMembership.team_role]} />}
          </View>

          <View style={styles.avatarStack}>
            {activeMembers.slice(0, 3).map((m, idx) => (
              <View key={m.id} style={[styles.stackAvatar, { marginLeft: idx === 0 ? 0 : -10 }]}>
                <Avatar uri={m.profile?.avatar_url} name={m.profile?.full_name} size={28} />
              </View>
            ))}
            {activeMembers.length > 3 && (
              <View style={[styles.stackAvatar, styles.stackMore, { marginLeft: -10 }]}>
                <Text style={styles.stackMoreText}>+{activeMembers.length - 3}</Text>
              </View>
            )}
            <Text style={styles.memberCountText}>{activeMembers.length} Members</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.planRow}>
            <View style={styles.planRowLeft}>
              <Ionicons name="ribbon" size={16} color={colors.primary} />
              <Text style={styles.planText}>
                {membership?.plan ? `${membership.plan.name}` : 'No active plan'}
              </Text>
            </View>
            <Badge
              label={membership?.status === 'ACTIVE' ? 'ACTIVE' : membership?.status ?? 'NONE'}
              tone={membership?.status === 'ACTIVE' ? 'active' : 'pending'}
            />
          </View>
        </View>

        <Pressable style={styles.walletCard} onPress={() => router.push(`/(app)/wallet/${team.id}`)}>
          <Text style={styles.walletLabel}>Team Credits</Text>
          <Text style={styles.walletValue}>{Math.round(wallet?.available_credits ?? 0).toLocaleString()}</Text>
          <Text style={styles.walletCaption}>Credits</Text>
          <Text style={styles.walletSub}>Shared team wallet{'\n'}Credits are owned by the team.</Text>
          <View style={styles.walletCta}>
            <Text style={styles.walletCtaText}>VIEW ACTIVITY</Text>
            <Ionicons name="arrow-forward" size={14} color="#FFFFFF" />
          </View>
        </Pressable>

        <View style={styles.bookTurfWrap}>
          <Button title="Book Turf" iconLeft="football" onPress={handleBookTurf} />
        </View>
        <View style={styles.bookTurfWrap}>
          <Button title="Team Chat" iconLeft="chatbubbles-outline" variant="outline" onPress={handleOpenChat} />
        </View>

        <View style={styles.statsRow}>
          <StatBox icon="people" value={activeMembers.length} label="MEMBERS" />
          <StatBox icon="football" value={bookingCounts?.played ?? 0} label="GAMES PLAYED" />
          <StatBox icon="calendar" value={bookingCounts?.upcoming ?? 0} label="UPCOMING" highlight />
        </View>

        {upcoming && (
          <>
            <Text style={styles.sectionTitle}>Upcoming Game</Text>
            <Pressable style={styles.upcomingCard} onPress={() => router.push(`/(app)/booking/${upcoming.id}`)}>
              <Badge label="CONFIRMED" tone="active" />
              <Text style={styles.upcomingTitle}>{upcoming.turf?.name ?? 'Turf Booking'}</Text>
              <Text style={styles.upcomingMeta}>
                {formatBookingDate(upcoming.booking_date)} • {formatSlotTime(upcoming.start_time)}–
                {formatSlotTime(upcoming.end_time)}
              </Text>
              <Text style={styles.upcomingLink}>MANAGE BOOKING →</Text>
            </Pressable>
          </>
        )}

        {isHostOrCoHost && pendingRequests.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Join Requests</Text>
            {pendingRequests.map((m) => (
              <View key={m.id} style={styles.requestRow}>
                <Avatar uri={m.profile?.avatar_url} name={m.profile?.full_name} size={36} />
                <Text style={styles.requestName}>{m.profile?.full_name ?? 'Member'}</Text>
                <Pressable
                  style={styles.acceptChip}
                  disabled={busyId === m.id}
                  onPress={() => handleRespondToJoin(m.id, true)}
                >
                  <Text style={styles.acceptChipText}>Accept</Text>
                </Pressable>
                <Pressable
                  style={styles.rejectChip}
                  disabled={busyId === m.id}
                  onPress={() => handleRespondToJoin(m.id, false)}
                >
                  <Ionicons name="close" size={16} color={colors.danger} />
                </Pressable>
              </View>
            ))}
          </>
        )}

        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>Members</Text>
        </View>
        <View style={styles.membersGrid}>
          {activeMembers.map((m) => (
            <Pressable key={m.id} style={styles.memberTile} onPress={() => handleMemberAction(m)}>
              <View style={m.team_role === 'HOST' ? styles.memberAvatarHostRing : undefined}>
                <Avatar uri={m.profile?.avatar_url} name={m.profile?.full_name} size={52} />
              </View>
              {m.team_role !== 'MEMBER' && (
                <Badge label={m.team_role === 'HOST' ? 'HOST' : 'CO-HOST'} tone={ROLE_TONE[m.team_role]} />
              )}
              <Text style={styles.memberTileName} numberOfLines={1}>
                {m.user_id === session?.user.id ? 'You' : (m.profile?.full_name?.split(' ')[0] ?? 'Member')}
              </Text>
            </Pressable>
          ))}
        </View>

        {invitedMembers.length > 0 && (
          <View style={styles.invitedWrap}>
            <Text style={styles.invitedLabel}>Invited (awaiting acceptance)</Text>
            {invitedMembers.map((m) => (
              <Text key={m.id} style={styles.invitedName}>
                • {m.profile?.full_name ?? 'Member'}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatBox({
  icon,
  value,
  label,
  highlight,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.statBox}>
      <View style={[styles.statIcon, highlight && styles.statIconHighlight]}>
        <Ionicons name={icon} size={16} color={highlight ? colors.primary : colors.text} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  activeDotRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  headerSubtitle: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.4 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl },

  bannerWrap: {
    width: '100%',
    height: 140,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: '#0F1729',
    marginBottom: spacing.md,
  },
  bannerImage: { width: '100%', height: '100%' },
  bannerPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  bannerPlaceholderText: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  bannerEditBadge: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15, 23, 41, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  summaryTeam: { fontSize: 18, fontWeight: '800', color: colors.text },
  idRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  idText: { fontSize: 11, color: colors.textMuted },
  avatarStack: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.md },
  stackAvatar: { borderWidth: 2, borderColor: '#FFFFFF', borderRadius: 16 },
  stackMore: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackMoreText: { fontSize: 10, fontWeight: '700', color: colors.text },
  memberCountText: { fontSize: 12, color: colors.textMuted, marginLeft: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  planRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  planText: { fontSize: 13, fontWeight: '600', color: colors.text },

  walletCard: {
    backgroundColor: '#0F1729',
    borderRadius: radii.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  walletLabel: { fontSize: 12, color: '#A7F3D0', fontWeight: '700' },
  walletValue: { fontSize: 30, fontWeight: '800', color: '#FFFFFF', marginTop: 4 },
  walletCaption: { fontSize: 12, color: '#94A3B8' },
  walletSub: { fontSize: 11, color: '#64748B', marginTop: spacing.sm, lineHeight: 16 },
  walletCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    marginTop: spacing.md,
  },
  walletCtaText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.3 },

  bookTurfWrap: { marginTop: spacing.md },
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statIconHighlight: { backgroundColor: '#ECFDF5' },
  statValue: { fontSize: 16, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 9, fontWeight: '700', color: colors.textMuted, marginTop: 2, letterSpacing: 0.3 },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  upcomingCard: { backgroundColor: '#0F1729', borderRadius: radii.lg, padding: spacing.lg },
  upcomingTitle: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', marginTop: spacing.sm },
  upcomingMeta: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  upcomingLink: { fontSize: 12, fontWeight: '700', color: '#5EEAD4', marginTop: spacing.sm },

  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: radii.md,
    padding: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  requestName: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  acceptChip: {
    backgroundColor: colors.primary,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  acceptChipText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  rejectChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    padding: 6,
  },

  membersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  memberTile: { width: 72, alignItems: 'center' },
  memberAvatarHostRing: { borderWidth: 2, borderColor: '#B45309', borderRadius: 28, padding: 2 },
  memberTileName: { fontSize: 11, fontWeight: '600', color: colors.text, marginTop: 4 },

  invitedWrap: { marginTop: spacing.lg },
  invitedLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, marginBottom: spacing.xs },
  invitedName: { fontSize: 12, color: colors.textMuted, marginBottom: 2 },
});
