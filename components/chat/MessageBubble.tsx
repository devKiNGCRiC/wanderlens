import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

export type Reaction = { emoji: string; user_id: string };

export type MessageItem = {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  pending?: boolean;
  failed?: boolean;
  reply_to_id?: string | null;
  reply_to_content?: string | null;
  reply_to_sender_name?: string | null;
  reactions?: Reaction[];
  message_type?: 'text' | 'image';
  media_path?: string | null;
  media_url?: string | null;
  local_uri?: string | null;
};

type Props = {
  message: MessageItem;
  isMine: boolean;
  myUserId: string;
  onRetry?: () => void;
  onLongPress?: () => void;
  onToggleReaction?: (emoji: string) => void;
  onPressImage?: (uri: string) => void;
};

function groupReactions(reactions: Reaction[] | undefined) {
  if (!reactions?.length) return [];
  const byEmoji = new Map<string, string[]>();
  for (const r of reactions) {
    const arr = byEmoji.get(r.emoji) ?? [];
    arr.push(r.user_id);
    byEmoji.set(r.emoji, arr);
  }
  return Array.from(byEmoji.entries()).map(([emoji, userIds]) => ({ emoji, userIds }));
}

export function MessageBubble({ message, isMine, myUserId, onRetry, onLongPress, onToggleReaction, onPressImage }: Props) {
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const grouped = groupReactions(message.reactions);
  const isImage = message.message_type === 'image';
  const imageSrc = message.local_uri || message.media_url;

  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      <Pressable onLongPress={onLongPress} delayLongPress={250} onPress={isImage && imageSrc ? () => onPressImage?.(imageSrc) : undefined}>
        {isImage ? (
          <View style={[styles.imageBubble, message.failed && styles.bubbleFailed]}>
            {imageSrc ? (
              <Image source={{ uri: imageSrc }} style={styles.image} contentFit="cover" />
            ) : (
              <View style={[styles.image, styles.imagePlaceholder]}><ActivityIndicator color={theme.color.gold} /></View>
            )}
            {message.pending && !message.failed && (
              <View style={styles.uploadingOverlay}><ActivityIndicator color={theme.color.cream} /></View>
            )}
          </View>
        ) : (
          <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs, message.failed && styles.bubbleFailed]}>
            {message.reply_to_content && (
              <View style={[styles.replyQuote, isMine && styles.replyQuoteMine]}>
                <Text style={[styles.replyQuoteName, isMine && styles.replyQuoteNameMine]} numberOfLines={1}>
                  {message.reply_to_sender_name || 'traveler'}
                </Text>
                <Text style={[styles.replyQuoteText, isMine && styles.replyQuoteTextMine]} numberOfLines={1}>
                  {message.reply_to_content}
                </Text>
              </View>
            )}
            <Text style={[styles.text, isMine ? styles.textMine : styles.textTheirs]}>{message.content}</Text>
          </View>
        )}
      </Pressable>

      {grouped.length > 0 && (
        <View style={[styles.reactionsRow, isMine ? styles.reactionsRowMine : styles.reactionsRowTheirs]}>
          {grouped.map(({ emoji, userIds }) => (
            <Pressable
              key={emoji}
              onPress={() => onToggleReaction?.(emoji)}
              style={[styles.reactionChip, userIds.includes(myUserId) && styles.reactionChipMine]}>
              <Text style={styles.reactionEmoji}>{emoji}</Text>
              {userIds.length > 1 && <Text style={styles.reactionCount}>{userIds.length}</Text>}
            </Pressable>
          ))}
        </View>
      )}

      <View style={[styles.metaRow, isMine ? styles.metaRowMine : styles.metaRowTheirs]}>
        {message.failed ? (
          <Pressable onPress={onRetry} style={styles.retryRow}>
            <Ionicons name="alert-circle-outline" size={12} color={theme.color.ember} />
            <Text style={styles.retryText}>Failed — tap to retry</Text>
          </Pressable>
        ) : (
          <Text style={styles.time}>{message.pending ? 'Sending…' : time}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginVertical: 3, maxWidth: '78%' },
  rowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  rowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: theme.radius.md, paddingVertical: 9, paddingHorizontal: 14 },
  bubbleMine: { backgroundColor: theme.color.gold, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderBottomLeftRadius: 4 },
  bubbleFailed: { opacity: 0.6 },
  imageBubble: { width: 200, height: 200, borderRadius: theme.radius.md, overflow: 'hidden', backgroundColor: theme.color.surface },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  uploadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,23,31,0.4)', alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: theme.font.bodyRegular, fontSize: 14, lineHeight: 19 },
  textMine: { color: theme.color.dusk },
  textTheirs: { color: theme.color.cream },
  replyQuote: { borderLeftWidth: 2, borderLeftColor: theme.color.surface2, paddingLeft: 8, marginBottom: 6 },
  replyQuoteMine: { borderLeftColor: 'rgba(20,23,31,0.35)' },
  replyQuoteName: { fontFamily: theme.font.body, fontSize: 11, color: theme.color.gold },
  replyQuoteNameMine: { color: theme.color.dusk },
  replyQuoteText: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.muted },
  replyQuoteTextMine: { color: 'rgba(20,23,31,0.7)' },
  reactionsRow: { flexDirection: 'row', gap: 4, marginTop: 3 },
  reactionsRowMine: { justifyContent: 'flex-end' },
  reactionsRowTheirs: { justifyContent: 'flex-start' },
  reactionChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: 10, paddingVertical: 2, paddingHorizontal: 6 },
  reactionChipMine: { borderColor: theme.color.gold },
  reactionEmoji: { fontSize: 12 },
  reactionCount: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.muted },
  metaRow: { marginTop: 3, paddingHorizontal: 4 },
  metaRowMine: { alignItems: 'flex-end' },
  metaRowTheirs: { alignItems: 'flex-start' },
  time: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.muted },
  retryRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  retryText: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.ember },
});
