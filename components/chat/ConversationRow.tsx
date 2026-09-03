import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/Avatar';
import { theme } from '@/constants/theme';
import { formatTimeAgo } from '@/lib/formatTimeAgo';

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

type Props = {
  item: ConversationSummary;
  myUserId: string;
  onPress: () => void;
  onLongPress?: () => void;
};

export function ConversationRow({ item, myUserId, onPress, onLongPress }: Props) {
  const name = item.is_group ? (item.group_name || 'Group') : (item.other_username || item.other_full_name || 'traveler');
  const isUnread = item.unread_count > 0;
  const preview = item.last_message_preview
    ? `${item.last_message_sender_id === myUserId ? 'You: ' : ''}${item.last_message_preview}`
    : 'Say hello 👋';

  return (
    <Pressable style={styles.row} onPress={onPress} onLongPress={onLongPress}>
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  groupAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  groupAvatarImage: { width: '100%', height: '100%' },
  body: { flex: 1, gap: 3 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nameRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { flex: 1, fontFamily: theme.font.body, fontSize: 14.5, color: theme.color.cream },
  time: { fontFamily: theme.font.mono, fontSize: 10, color: theme.color.muted, marginLeft: 8 },
  bottomLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  preview: { flex: 1, fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted },
  previewUnread: { color: theme.color.cream, fontFamily: theme.font.body },
  badge: { backgroundColor: theme.color.gold, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, marginLeft: 8 },
  badgeText: { fontFamily: theme.font.body, fontSize: 10, color: theme.color.dusk },
});
