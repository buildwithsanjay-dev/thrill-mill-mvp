import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '@/constants/theme';
import { useMyTeams } from '@/features/team/useTeams';

export default function TabsLayout() {
  const { data: teams } = useMyTeams();
  // Total pending join requests across every Team I manage — RLS already
  // scopes PENDING rows to that Team's Host/Co-host/Admin (see
  // team/api.ts's getMyTeams), so a plain member's Teams always contribute
  // 0 here without any extra role check.
  const pendingActionCount = (teams ?? []).reduce((sum, t) => sum + t.pendingRequestCount, 0);

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarBadgeStyle: { backgroundColor: '#DC2626' },
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
    </Tabs>
  );
}
