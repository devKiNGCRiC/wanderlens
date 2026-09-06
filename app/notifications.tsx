import { useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useNotifications } from '@/context/NotificationsProvider';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Avatar } from '@/components/Avatar';
import { ActionSheet } from '@/components/ActionSheet';
import { formatTimeAgo } from '@/lib/formatTimeAgo';

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  related_id: string | null;
  related_comment_id: string | null;
  is_read: boolean;
  created_at: string;
  actor_id: string | null;
  actor_username: string | null;
  actor_full_name: string | null;
  actor_avatar_url: string | null;
  spot_title: string | null;
  spot_photo_url: string | null;
};

const SPOT_TYPES = new Set(['spot_like', 'spot_comment', 'comment_reply', 'comment_like', 'spot_shared']);

function iconFor(type: string): keyof typeof Ionicons.glyphMap {
  if (type === 'connect_request') return 'person-add';
  if (type === 'connect_accepted') return 'checkmark-circle';
  if (type === 'spot_like' || type === 'comment_like') return 'heart';
  if (type === 'spot_comment' || type === 'comment_reply') return 'chatbubble';
  if (type === 'spot_shared') return 'arrow-redo';
  if (type === 'message_request') return 'mail';
  return 'notifications';
}

function badgeColorFor(type: string): string {
  if (type === 'spot_like' || type === 'comment_like') return theme.color.ember;
  if (type === 'spot_comment' || type === 'comment_reply') return theme.color.duskPurple;
  if (type === 'message_request') return theme.color.gold;
  return theme.color.gold;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refreshUnreadCount } = useNotifications();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionTarget, setActionTarget] = useState<NotificationRow | null>(null);

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

  function handlePress(item: NotificationRow) {
    if (item.type === 'connect_request' || item.type === 'connect_accepted') {
      router.push({ pathname: '/(tabs)/connect', params: { segment: item.type === 'connect_request' ? 'Requests' : 'Connections' } });
      return;
    }
    if (item.type === 'message_request') {
      if (item.related_id) router.push({ pathname: '/chat/[id]', params: { id: item.related_id } });
      return;
    }
    if (SPOT_TYPES.has(item.type)) {
      // spot_title comes back null if the spot itself was deleted — nothing
      // sensible to navigate to in that case, just show the stored text.
      if (item.related_id && item.spot_title) {
        router.push({ pathname: '/spot/[id]', params: { id: item.related_id } });
      }
      return;
    }
  }

  async function deleteOne(item: NotificationRow) {
    setItems((prev) => prev.filter((n) => n.id !== item.id));
    const { error } = await supabase.rpc('delete_notification', { p_id: item.id });
    if (error) {
      Alert.alert('Could not delete', 'Please try again.');
      load();
      return;
    }
    if (!item.is_read) refreshUnreadCount();
  }

  function clearAll() {
    Alert.alert('Clear all notifications?', 'This removes every notification from your activity feed. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear all',
        style: 'destructive',
        onPress: async () => {
          const previous = items;
          setItems([]);
          const { error } = await supabase.rpc('clear_all_notifications');
          if (error) {
            Alert.alert('Could not clear', 'Please try again.');
            setItems(previous);
            return;
          }
          refreshUnreadCount();
        },
      },
    ]);
  }

  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={22} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        {items.length > 0 ? (
          <Pressable onPress={clearAll} style={styles.clearBtn} accessibilityLabel="Clear all notifications">
            <Text style={styles.clearText}>Clear all</Text>
          </Pressable>
        ) : (
          <View style={styles.backBtn} />
        )}
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
              onPress={() => handlePress(item)}
              onLongPress={() => setActionTarget(item)}
              delayLongPress={250}
              style={[styles.row, !item.is_read && styles.rowUnread]}>
              {item.actor_id ? (
                <View style={styles.avatarWrap}>
                  <Avatar uri={item.actor_avatar_url} label={item.actor_username || item.actor_full_name || '?'} size={40} />
                  <View style={[styles.typeBadge, { backgroundColor: badgeColorFor(item.type) }]}>
                    <Ionicons name={iconFor(item.type)} size={10} color={theme.color.dusk} />
                  </View>
                </View>
              ) : (
                <View style={styles.iconWrap}>
                  <Ionicons name={iconFor(item.type)} size={19} color={theme.color.dusk} />
                </View>
              )}
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                {!!item.body && <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text>}
                <Text style={styles.rowTime}>{formatTimeAgo(item.created_at)}</Text>
              </View>
              {item.spot_photo_url && (
                <Image source={{ uri: item.spot_photo_url }} style={styles.spotThumb} contentFit="cover" />
              )}
              {!item.is_read && <View style={styles.unreadDot} />}
            </Pressable>
          )}
        />
      )}

      <ActionSheet
        visible={!!actionTarget}
        onClose={() => setActionTarget(null)}
        options={[
          { key: 'delete', label: 'Delete notification', icon: 'trash-outline', destructive: true, onPress: () => actionTarget && deleteOne(actionTarget) },
        ]}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  clearBtn: { paddingHorizontal: 4, paddingVertical: 8 },
  clearText: { fontFamily: theme.font.body, fontSize: 12, color: theme.color.gold },
  title: { fontFamily: theme.font.display, fontSize: 18, color: theme.color.cream },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 14, color: theme.color.muted, textAlign: 'center', lineHeight: 20 },
  retryBtn: { marginTop: 16, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, paddingVertical: 10, paddingHorizontal: 20 },
  retryText: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.gold },
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.color.surface2 },
  rowUnread: { backgroundColor: theme.color.goldTint },
  iconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center' },
  avatarWrap: { width: 40, height: 40 },
  typeBadge: { position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.color.dusk },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontFamily: theme.font.body, fontSize: 14, color: theme.color.cream },
  rowBody: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted },
  rowTime: { fontFamily: theme.font.mono, fontSize: 10, color: theme.color.muted, marginTop: 2 },
  spotThumb: { width: 40, height: 40, borderRadius: theme.radius.sm, backgroundColor: theme.color.surface2 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.color.ember, marginTop: 6 },
});
