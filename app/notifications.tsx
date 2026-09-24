/**
 * Route: /notifications, the in-app activity feed behind the bell icon.
 *
 * Purpose: lists the signed-in user's notifications (connection requests and
 * accepts, likes, comments, replies, shared spots, message requests) and lets
 * them jump to the related screen, delete one, or clear all. Opened from the
 * bell in the Feed tab header (app/(tabs)/index.tsx). It has no explicit
 * `<Stack.Screen>` entry in app/_layout.tsx, so expo-router registers it with
 * default options; the screen hides the header itself.
 *
 * How it works:
 * - Notification rows are created server-side by Postgres triggers (see
 *   .claude/rules/supabase.md); this screen only reads and deletes them.
 * - Reads via the `get_notifications` RPC, which also joins in the actor's
 *   profile and the related spot's title/photo so each row renders without
 *   extra queries.
 * - After a successful load it calls `mark_notifications_read`, then
 *   `refreshUnreadCount()` from NotificationsProvider so the bell badge
 *   clears. Rows keep their unread styling until the next load.
 * - Delete and Clear all go through the `delete_notification` and
 *   `clear_all_notifications` RPCs and update the list optimistically
 *   (remove first, restore/reload if the call fails).
 * - `useFocusEffect` reloads each time the screen is focused.
 */
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

/**
 * One row returned by the `get_notifications` RPC. `related_id` points at the
 * spot, conversation or other object the notification is about, depending on
 * `type`. The `actor_*` fields describe who triggered it and are null for the
 * older connection-event rows; the `spot_*` fields are null when the
 * notification isn't about a spot or that spot was deleted.
 */
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

// Notification types whose `related_id` is a spot id; tapping them opens /spot/[id].
const SPOT_TYPES = new Set(['spot_like', 'spot_comment', 'comment_reply', 'comment_like', 'spot_shared']);

/**
 * Picks the Ionicons glyph for a notification type. The return type
 * `keyof typeof Ionicons.glyphMap` makes TypeScript reject icon names that
 * don't exist. Unknown types fall back to a generic bell.
 */
function iconFor(type: string): keyof typeof Ionicons.glyphMap {
  if (type === 'connect_request') return 'person-add';
  if (type === 'connect_accepted') return 'checkmark-circle';
  if (type === 'spot_like' || type === 'comment_like') return 'heart';
  if (type === 'spot_comment' || type === 'comment_reply') return 'chatbubble';
  if (type === 'spot_shared') return 'arrow-redo';
  if (type === 'message_request') return 'mail';
  return 'notifications';
}

/**
 * Background colour of the small type badge drawn over the actor's avatar:
 * ember for likes, dusk purple for comments, gold for everything else.
 */
function badgeColorFor(type: string): string {
  if (type === 'spot_like' || type === 'comment_like') return theme.color.ember;
  if (type === 'spot_comment' || type === 'comment_reply') return theme.color.duskPurple;
  if (type === 'message_request') return theme.color.gold;
  return theme.color.gold;
}

/**
 * Notifications screen. Loads the list on focus, marks everything read, and
 * handles tap (navigate), long-press (delete sheet) and Clear all.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Re-syncs the unread badge count held in NotificationsProvider.
  const { refreshUnreadCount } = useNotifications();
  // List data plus loading / error flags for the four UI states, and the row
  // whose long-press action sheet is open (null when the sheet is closed).
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionTarget, setActionTarget] = useState<NotificationRow | null>(null);

  /**
   * Fetches up to 50 notifications, then marks them all read and refreshes the
   * badge. On failure it shows the error state instead of an empty list.
   * Wrapped in useCallback with no deps so it is a stable function that can be
   * used by useFocusEffect and the Retry / delete-rollback paths.
   */
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
    // Viewing the list counts as reading it. The rows already in state keep
    // their is_read=false styling for this visit. The result of this call
    // is not checked.
    await supabase.rpc('mark_notifications_read');
    refreshUnreadCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // useFocusEffect runs every time this screen comes into focus (not only on
  // first mount), so new notifications appear when the user returns here.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /**
   * Routes a tapped notification to the screen it is about:
   * - connection events open the Connect tab on the Requests or Connections segment
   * - message requests open the conversation /chat/[id]
   * - spot-related types open /spot/[id] if the spot still exists
   * Any other type does nothing on tap.
   */
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

  /**
   * Deletes a single notification (from the long-press sheet). Optimistic:
   * the row disappears immediately; if the RPC fails the list is reloaded
   * from the server. The badge only needs refreshing if the row was unread.
   */
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

  /**
   * Asks for confirmation, then deletes every notification. Optimistic: the
   * list empties at once and the previous items are put back if the
   * `clear_all_notifications` RPC fails.
   */
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

  // Native header hidden; the custom header respects the safe-area top inset.
  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Header: back, title, and "Clear all" when there is something to clear
          (otherwise an empty 44pt box keeps the title centred). */}
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

      {/* Body: loading spinner, error with Retry, empty message, or the list. */}
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
              {/* Leading visual: the actor's avatar with a small type badge,
                  or just a type icon for rows with no actor (older connect events). */}
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
              {/* Title, optional body (max 2 lines) and relative time. */}
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                {!!item.body && <Text style={styles.rowBody} numberOfLines={2}>{item.body}</Text>}
                <Text style={styles.rowTime}>{formatTimeAgo(item.created_at)}</Text>
              </View>
              {/* Trailing spot thumbnail (spot notifications) and unread dot. */}
              {item.spot_photo_url && (
                <Image source={{ uri: item.spot_photo_url }} style={styles.spotThumb} contentFit="cover" />
              )}
              {!item.is_read && <View style={styles.unreadDot} />}
            </Pressable>
          )}
        />
      )}

      {/* Long-press action sheet; visible whenever a row is selected. */}
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

// Styles use colour, font and radius tokens from constants/theme.ts.
const styles = StyleSheet.create({
  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  clearBtn: { paddingHorizontal: 4, paddingVertical: 8 },
  clearText: { fontFamily: theme.font.body, fontSize: 12, color: theme.color.gold },
  title: { fontFamily: theme.font.display, fontSize: 18, color: theme.color.cream },
  // Loading / empty / error states
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 14, color: theme.color.muted, textAlign: 'center', lineHeight: 20 },
  retryBtn: { marginTop: 16, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, paddingVertical: 10, paddingHorizontal: 20 },
  retryText: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.gold },
  // Notification row
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
