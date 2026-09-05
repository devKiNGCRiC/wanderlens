import { useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useNotifications } from '@/context/NotificationsProvider';
import { ScreenBackground } from '@/components/ScreenBackground';
import { formatTimeAgo } from '@/lib/formatTimeAgo';

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  related_id: string | null;
  is_read: boolean;
  created_at: string;
};

function iconFor(type: string): keyof typeof Ionicons.glyphMap {
  if (type === 'connect_request') return 'person-add-outline';
  if (type === 'connect_accepted') return 'checkmark-circle-outline';
  return 'notifications-outline';
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refreshUnreadCount } = useNotifications();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase.rpc('get_notifications', { p_limit: 50 });
    if (error || !data) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    setItems(data as NotificationRow[]);
    setLoading(false);
    await supabase.rpc('mark_notifications_read');
    refreshUnreadCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.centerFill}>
          <ActivityIndicator color={theme.color.gold} />
        </View>
      ) : loadError ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>Couldn&apos;t load notifications.</Text>
          <Pressable onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centerFill}>
          <Text style={styles.emptyText}>No notifications yet — connect with more travelers to see activity here.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push({ pathname: '/(tabs)/connect', params: { segment: item.type === 'connect_request' ? 'Requests' : 'Connections' } })}
              style={[styles.row, !item.is_read && styles.rowUnread]}>
              <View style={styles.iconWrap}>
                <Ionicons name={iconFor(item.type)} size={19} color={theme.color.dusk} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                {!!item.body && <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text>}
                <Text style={styles.rowTime}>{formatTimeAgo(item.created_at)}</Text>
              </View>
              {!item.is_read && <View style={styles.unreadDot} />}
            </Pressable>
          )}
        />
      )}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: theme.font.display, fontSize: 18, color: theme.color.cream },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 14, color: theme.color.muted, textAlign: 'center', lineHeight: 20 },
  retryBtn: { marginTop: 16, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, paddingVertical: 10, paddingHorizontal: 20 },
  retryText: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.gold },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.color.surface2 },
  rowUnread: { backgroundColor: theme.color.goldTint },
  iconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: theme.font.body, fontSize: 14, color: theme.color.cream },
  rowBody: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted },
  rowTime: { fontFamily: theme.font.mono, fontSize: 10, color: theme.color.muted, marginTop: 2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.color.ember, marginTop: 6 },
});
