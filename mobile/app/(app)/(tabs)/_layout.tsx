import { Redirect, Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/constants/theme';
import { useProfile } from '@/features/profile/useProfile';
import { useMyTeams } from '@/features/team/useTeams';

export default function TabsLayout() {
  const { data: profile } = useProfile();
  const { data: teams } = useMyTeams();
  // Total pending join requests across every Team I manage — RLS already
  // scopes PENDING rows to that Team's Host/Co-host/Admin (see
  // team/api.ts's getMyTeams), so a plain member's Teams always contribute
  // 0 here without any extra role check.
  const pendingActionCount = (teams ?? []).reduce((sum, t) => sum + t.pendingRequestCount, 0);

  // The customer Home / Book / Team / Profile tabs must never render for an
  // Admin (they would see the "Create a Team" first-run dashboard). Whatever
  // route or notification led here, an Admin is sent to their own shell.
  if (profile?.platform_role === 'ADMIN') {
    return <Redirect href="/(admin)/(tabs)" />;
  }

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarBadgeStyle: { backgroundColor: colors.danger },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="book"
        options={{
          title: 'Book',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: 'Team',
          tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
          tabBarBadge: pendingActionCount > 0 ? pendingActionCount : undefined,
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: 'Leaderboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
