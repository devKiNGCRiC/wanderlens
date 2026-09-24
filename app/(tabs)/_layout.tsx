/**
 * Layout for the (tabs) route group: the bottom tab bar of the main app.
 *
 * Purpose: defines the five tabs a signed-in, onboarded user moves between:
 * Feed (index), Map, Connect, Chat and Profile. It is only reachable inside
 * guard 2 of app/_layout.tsx (session present and profile onboarded).
 *
 * How it works:
 * - expo-router's <Tabs> maps each <Tabs.Screen name> to a file in this
 *   folder (index.tsx, map.tsx, connect.tsx, chat.tsx, profile.tsx).
 * - Every tab button is rendered by HapticTab (components/haptic-tab.tsx),
 *   which adds a light haptic tap on iOS.
 * - The Chat tab shows an unread badge from ChatProvider's `unreadCount`.
 * - The whole tab navigator is wrapped in TourProvider, which runs the
 *   first-run spotlight tour over these tabs (context/TourProvider.tsx).
 *
 * Why: the tab bar height comes from TAB_BAR_BASE_HEIGHT in
 * constants/layout.ts, which the tour also reads, so the tour's tab-bar
 * highlights line up with the real bar. The bottom safe-area inset is added
 * on top so the bar clears the phone's home indicator / gesture area.
 */
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { theme } from '@/constants/theme';
import { TAB_BAR_BASE_HEIGHT } from '@/constants/layout';
import { useChat } from '@/context/ChatProvider';
import { TourProvider } from '@/context/TourProvider';

/**
 * Tab navigator for the main app. Headers are hidden because each tab screen
 * draws its own header inside <ScreenBackground>.
 */
export default function TabLayout() {
  // Unread message count for the Chat tab badge, kept up to date by ChatProvider.
  const { unreadCount } = useChat();
  // Device safe-area insets; insets.bottom is the height of the home
  // indicator / gesture bar, which the tab bar must sit above.
  const insets = useSafeAreaInsets();

  return (
    <TourProvider>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: theme.color.gold,
        tabBarInactiveTintColor: theme.color.muted,
        tabBarStyle: {
          backgroundColor: theme.color.surface,
          borderTopColor: theme.color.surface2,
          height: TAB_BAR_BASE_HEIGHT + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 16,
        },
      }}>
      {/* Tab order here is the left-to-right order in the tab bar. */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }) => <Ionicons name="images-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, size }) => <Ionicons name="location-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="connect"
        options={{
          title: 'Connect',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
      {/* Chat: the badge is hidden (undefined) when there is nothing unread. */}
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-outline" size={size} color={color} />,
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.color.ember, color: theme.color.cream, fontFamily: theme.font.body, fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
    </TourProvider>
  );
}