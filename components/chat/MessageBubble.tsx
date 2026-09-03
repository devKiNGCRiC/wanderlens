import type { RefObject } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

export type Reaction = { emoji: string; user_id: string };

export type MessageItem = {
  id: string;
  sender_id: string;
  content: string | null;
  created_at: string;
  pending?: boolean;
  failed?: boolean;
  reply_to_id?: string | null;
  reply_to_content?: string | null;
  reply_to_sender_name?: string | null;
  reactions?: Reaction[];
  message_type?: 'text' | 'image' | 'gallery';
  media_path?: string | null;
  media_url?: string | null;
  local_uri?: string | null;
  gallery_layout?: 'collage' | 'grid' | null;
  attachments?: { id?: string; media_path?: string; media_url?: string; local_uri?: string }[];
};

type Props = {
  message: MessageItem;
  isMine: boolean;
  myUserId: string;
  onRetry?: () => void;
  onLongPress?: () => void;
  onToggleReaction?: (emoji: string) => void;
  onPressImage?: (uri: string) => void;
  onSaveGallery?: () => void;
  polaroidRef?: RefObject<View | null>;
  galleryRef?: RefObject<View | null>;
};

const CLUSTER_ROTATIONS = [-7, 5, -4, 6, -6, 4];
const CLUSTER_COLS = 3;

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

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

export function MessageBubble({ message, isMine, myUserId, onRetry, onLongPress, onToggleReaction, onPressImage, onSaveGallery, polaroidRef, galleryRef }: Props) {
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const grouped = groupReactions(message.reactions);
  const isImage = message.message_type === 'image';
  const isGallery = message.message_type === 'gallery';
  const imageSrc = message.local_uri || message.media_url;
  const attachments = message.attachments ?? [];
  const useGrid = message.gallery_layout === 'grid';
  const visibleAttachments = attachments.slice(0, useGrid ? 4 : 6);
  const extraCount = attachments.length - visibleAttachments.length;

  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      {isGallery ? (
        <View style={styles.galleryOuter}>
        <View ref={galleryRef} collapsable={false} style={[useGrid ? styles.gridWrap : styles.galleryWrap, message.failed && styles.bubbleFailed]}>
          {useGrid ? (
            <View style={styles.gridGroup}>
              {visibleAttachments.map((att, i) => {
                const src = att.local_uri || att.media_url;
                const showMore = i === visibleAttachments.length - 1 && extraCount > 0;
                return (
                  <Pressable
                    key={att.id ?? att.media_path ?? i}
                    onLongPress={onLongPress}
                    delayLongPress={250}
                    onPress={src ? () => onPressImage?.(src) : undefined}
                    style={styles.gridCell}>
                    {src ? (
                      <Image source={{ uri: src }} style={styles.image} contentFit="cover" />
                    ) : (
                      <View style={[styles.image, styles.imagePlaceholder]}><ActivityIndicator size="small" color={theme.color.gold} /></View>
                    )}
                    {showMore && <View style={styles.galleryMoreOverlay}><Text style={styles.galleryMoreText}>+{extraCount}</Text></View>}
                  </Pressable>
                );
              })}
            </View>
          ) : (
            chunk(visibleAttachments, CLUSTER_COLS).map((row, rowIndex) => (
              <View key={rowIndex} style={[styles.clusterRow, rowIndex > 0 && styles.clusterRowOverlap]}>
                {row.map((att, colIndex) => {
                  const i = rowIndex * CLUSTER_COLS + colIndex;
                  const src = att.local_uri || att.media_url;
                  const showMore = i === visibleAttachments.length - 1 && extraCount > 0;
                  const rotate = CLUSTER_ROTATIONS[i % CLUSTER_ROTATIONS.length];
                  return (
                    <Pressable
                      key={att.id ?? att.media_path ?? i}
                      onLongPress={onLongPress}
                      delayLongPress={250}
                      onPress={src ? () => onPressImage?.(src) : undefined}
                      style={[styles.miniPolaroid, colIndex > 0 && styles.miniPolaroidOverlap, { transform: [{ rotate: `${rotate}deg` }] }]}>
                      <View style={styles.miniPhotoWrap}>
                        {src ? (
                          <Image source={{ uri: src }} style={styles.image} contentFit="cover" />
                        ) : (
                          <View style={[styles.image, styles.imagePlaceholder]}><ActivityIndicator size="small" color={theme.color.gold} /></View>
                        )}
                        {showMore && <View style={styles.galleryMoreOverlay}><Text style={styles.galleryMoreText}>+{extraCount}</Text></View>}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))
          )}
          {message.pending && !message.failed && (
            <Text style={styles.galleryMeta}>Uploading {attachments.length} photos…</Text>
          )}
          {!!message.content && <Text style={styles.galleryCaption}>{message.content}</Text>}
          {message.failed ? (
            <Pressable onPress={onRetry} style={styles.polaroidRetryRow}>
              <Ionicons name="alert-circle-outline" size={11} color={theme.color.ember} />
              <Text style={styles.polaroidRetryText}>Failed — tap to retry</Text>
            </Pressable>
          ) : !message.pending ? (
            <Text style={styles.galleryMeta}>{time}</Text>
          ) : null}
        </View>
        {onSaveGallery && !message.pending && !message.failed && (
          <Pressable onPress={onSaveGallery} style={styles.gallerySaveBtn}>
            <Ionicons name="download-outline" size={14} color={theme.color.cream} />
          </Pressable>
        )}
        </View>
      ) : (
        <Pressable onLongPress={onLongPress} delayLongPress={250} onPress={isImage && imageSrc ? () => onPressImage?.(imageSrc) : undefined}>
          {isImage ? (
            <View ref={polaroidRef} collapsable={false} style={[styles.polaroidFrame, message.failed && styles.bubbleFailed]}>
              <View style={styles.polaroidPhotoWrap}>
                {imageSrc ? (
                  <Image source={{ uri: imageSrc }} style={styles.image} contentFit="cover" />
                ) : (
                  <View style={[styles.image, styles.imagePlaceholder]}><ActivityIndicator color={theme.color.gold} /></View>
                )}
                {message.pending && !message.failed && (
                  <View style={styles.uploadingOverlay}><ActivityIndicator color={theme.color.cream} /></View>
                )}
              </View>
              {!!message.content && <Text style={styles.polaroidCaption}>{message.content}</Text>}
              {message.failed ? (
                <Pressable onPress={onRetry} style={styles.polaroidRetryRow}>
                  <Ionicons name="alert-circle-outline" size={11} color={theme.color.ember} />
                  <Text style={styles.polaroidRetryText}>Failed — tap to retry</Text>
                </Pressable>
              ) : (
                <Text style={styles.polaroidMeta}>{message.pending ? 'Sending…' : time}</Text>
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
      )}

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

      {!isImage && !isGallery && (
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
      )}
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
  polaroidFrame: { backgroundColor: theme.color.cream, padding: 8, paddingBottom: 12, borderRadius: theme.radius.sm, width: 190, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  polaroidPhotoWrap: { width: '100%', height: 174, borderRadius: 2, overflow: 'hidden', backgroundColor: theme.color.surface2 },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  uploadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,23,31,0.4)', alignItems: 'center', justifyContent: 'center' },
  polaroidCaption: { fontFamily: theme.font.displayItalic, fontSize: 12.5, color: theme.color.dusk, marginTop: 8, textAlign: 'center' },
  polaroidMeta: { fontFamily: theme.font.mono, fontSize: 9, color: '#8a7f6e', textAlign: 'center', marginTop: 6 },
  polaroidRetryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 },
  polaroidRetryText: { fontFamily: theme.font.mono, fontSize: 9, color: theme.color.ember },
  galleryWrap: { paddingHorizontal: 10, paddingTop: 6, width: 210 },
  clusterRow: { flexDirection: 'row' },
  clusterRowOverlap: { marginTop: -18 },
  miniPolaroid: { backgroundColor: theme.color.cream, padding: 4, paddingBottom: 8, borderRadius: 3, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  miniPolaroidOverlap: { marginLeft: -16 },
  miniPhotoWrap: { width: 60, height: 60, borderRadius: 2, overflow: 'hidden', backgroundColor: theme.color.surface2 },
  galleryOuter: { position: 'relative' },
  gallerySaveBtn: { position: 'absolute', top: -6, right: -6, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(20,23,31,0.65)', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  gridWrap: { width: 203 },
  gridGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, borderRadius: theme.radius.md, overflow: 'hidden' },
  gridCell: { width: 100, height: 100, backgroundColor: theme.color.surface2 },
  galleryMoreOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,23,31,0.55)', alignItems: 'center', justifyContent: 'center' },
  galleryMoreText: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.cream },
  galleryCaption: { fontFamily: theme.font.displayItalic, fontSize: 12.5, color: theme.color.cream, marginTop: 10, textAlign: 'center' },
  galleryMeta: { fontFamily: theme.font.mono, fontSize: 9, color: theme.color.muted, textAlign: 'center', marginTop: 6 },
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
