/**
 * ConversationRow, one line in a list of conversations (inbox style).
 *
 * Purpose: shows who the chat is with, the latest message preview, how long
 * ago it was sent, and status markers (pinned, favourite, muted, unread
 * count). Used by the Chat tab (app/(tabs)/chat.tsx), the archived chats
 * screen (app/chat/archived.tsx) and the new-message picker
 * (app/new-message.tsx).
 *
 * How it works:
 * - Purely presentational: the parent fetches rows (the Chat tab calls the
 *   list_conversations RPC) and passes one ConversationSummary per row.
 * - Handles both 1:1 chats and group chats. Groups show the group avatar
 *   (or a people icon) and a member count; 1:1 chats use the shared
 *   <Avatar> component for the other person.
 * - Unread rows get a brighter preview and a gold count badge capped at "9+".
 * - onPress opens the thread; the optional onLongPress lets the Chat tab
 *   open ConversationOptionsSheet.
 */
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { theme } from '@/constants/theme';
import { formatTimeAgo } from '@/lib/formatTimeAgo';

/**
 * One conversation as the list screens receive it, one row of the
 * list_conversations RPC result. Exported because the list screens type
 * their state with it.
 * - is_group / group_*: group chat details (null for 1:1 chats).
 * - other_*: the other participant in a 1:1 chat.
 * - last_message_*: drives the preview line and timestamp.
 * - my_status: the current user's membership state. 'request' means someone
 *   messaged them and they haven't accepted yet; 'left' means they left a group.
 * - unread_count and the is_* flags: per-user inbox state.
 */
export type ConversationSummary = {
  conversation_id: string;
  is_group: boolean;
  group_name: string | null;
  group_avatar_url: string | null;
  member_count: number;
  other_user_id: string;
  other_username: string | null;
  other_full_name: string | null;
  other_avatar_url: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  my_status: 'accepted' | 'request' | 'left';
  unread_count: number;
  is_pinned: boolean;
  is_muted: boolean;
  is_favorite: boolean;
  is_archived: boolean;
};

/**
 * item: the conversation to render.
 * myUserId: the signed-in user's id, used to prefix "You: " on own messages.
 * onPress / onLongPress: tap to open, long-press for options (optional).
 */
type Props = {
  item: ConversationSummary;
  myUserId: string;
  onPress: () => void;
  onLongPress?: () => void;
};

/** Renders one inbox row: avatar, name line with time, preview line with badges. */
export function ConversationRow({ item, myUserId, onPress, onLongPress }: Props) {
  // Display name: group name for groups; for 1:1 chats prefer username, then
  // full name, then a generic "traveler" (profile fields are nullable).
  const name = item.is_group ? (item.group_name || 'Group') : (item.other_username || item.other_full_name || 'traveler');
  const isUnread = item.unread_count > 0;
  // Preview line: "You: ..." when the last message was mine, or a friendly
  // prompt when the conversation has no messages yet.
  const preview = item.last_message_preview
    ? `${item.last_message_sender_id === myUserId ? 'You: ' : ''}${item.last_message_preview}`
    : 'Say hello 👋';

  return (
    <Pressable style={styles.row} onPress={onPress} onLongPress={onLongPress}>
      {/* Avatar: group photo or people icon for groups, profile Avatar for 1:1 */}
      {item.is_group ? (
        <View style={styles.groupAvatar}>
          {item.group_avatar_url ? (
            <Image source={{ uri: item.group_avatar_url }} style={styles.groupAvatarImage} />
          ) : (
            <Ionicons name="people" size={22} color={theme.color.dusk} />
          )}
        </View>
      ) : (
        <Avatar uri={item.other_avatar_url} label={name} size={50} />
      )}
      <View style={styles.body}>
        {/* Top line: pin/star markers, name, relative time of the last message */}
        <View style={styles.topLine}>
          <View style={styles.nameRow}>
            {item.is_pinned && <Ionicons name="pin" size={11} color={theme.color.gold} />}
            {item.is_favorite && <Ionicons name="star" size={11} color={theme.color.gold} />}
            <Text style={styles.name} numberOfLines={1}>{name}</Text>
          </View>
          {item.last_message_at && (
            <Text style={styles.time}>{formatTimeAgo(item.last_message_at)}</Text>
          )}
        </View>
        {/* Bottom line: message preview (with member count for groups),
            muted icon, and unread badge */}
        <View style={styles.bottomLine}>
          <Text style={[styles.preview, isUnread && styles.previewUnread]} numberOfLines={1}>
            {item.is_group ? `${item.member_count} members · ${preview}` : preview}
          </Text>
          {item.is_muted && <Ionicons name="notifications-off-outline" size={13} color={theme.color.muted} style={{ marginLeft: 6 }} />}
          {isUnread && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.unread_count > 9 ? '9+' : item.unread_count}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

// Styles use design tokens from constants/theme.ts.
const styles = StyleSheet.create({
  // Row and group avatar (50px circle, matching the 1:1 Avatar size)
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  groupAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  groupAvatarImage: { width: '100%', height: '100%' },
  // Text column: name/time line
  body: { flex: 1, gap: 3 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nameRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { flex: 1, fontFamily: theme.font.body, fontSize: 14.5, color: theme.color.cream },
  time: { fontFamily: theme.font.mono, fontSize: 10, color: theme.color.muted, marginLeft: 8 },
  // Preview line and unread badge
  bottomLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  preview: { flex: 1, fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted },
  previewUnread: { color: theme.color.cream, fontFamily: theme.font.body },
  badge: { backgroundColor: theme.color.gold, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, marginLeft: 8 },
  badgeText: { fontFamily: theme.font.body, fontSize: 10, color: theme.color.dusk },
});
