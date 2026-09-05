import { useEffect, useRef, useState, type RefObject } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { theme } from '@/constants/theme';
import { SpotPreviewCard } from '@/components/chat/SpotPreviewCard';
import { LocationPreviewCard } from '@/components/chat/LocationPreviewCard';

export type Reaction = { emoji: string; user_id: string };

export type MessageItem = {
  id: string;
  sender_id: string;
  sender_username?: string | null;
  sender_full_name?: string | null;
  content: string | null;
  created_at: string;
  pending?: boolean;
  failed?: boolean;
  reply_to_id?: string | null;
  reply_to_content?: string | null;
  reply_to_sender_name?: string | null;
  reactions?: Reaction[];
  message_type?: 'text' | 'image' | 'gallery' | 'spot' | 'location' | 'video' | 'voice' | 'document';
  media_path?: string | null;
  media_url?: string | null;
  local_uri?: string | null;
  video_duration_seconds?: number | null;
  voice_duration_seconds?: number | null;
  file_name?: string | null;
  file_size?: number | null;
  gallery_layout?: 'collage' | 'grid' | null;
  attachments?: { id?: string; media_path?: string; media_url?: string; local_uri?: string }[];
  shared_spot_id?: string | null;
  shared_spot_title?: string | null;
  shared_spot_photo_url?: string | null;
  shared_spot_genre?: string | null;
  shared_spot_location_label?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  location_label?: string | null;
};

type Props = {
  message: MessageItem;
  isMine: boolean;
  myUserId: string;
  /** Shown above the bubble — group threads only, never for your own messages. */
  senderLabel?: string;
  onRetry?: () => void;
  onLongPress?: () => void;
  onToggleReaction?: (emoji: string) => void;
  onPressImage?: (uri: string, attachmentIndex?: number) => void;
  onSaveGallery?: () => void;
  onPressSpot?: (spotId: string) => void;
  onPressLocation?: (lat: number, lng: number) => void;
  onPressVideo?: (uri: string) => void;
  onPressDocument?: (url: string) => void;
  polaroidRef?: RefObject<View | null>;
  galleryRef?: RefObject<View | null>;
  getAttachmentRef?: (index: number) => RefObject<View | null>;
};

const CLUSTER_ROTATIONS = [-7, 5, -4, 6, -6, 4];
const CLUSTER_COLS = 3;

// Saves always target these larger off-screen renders, never the visible
// chat-bubble-sized ones — capturing the small on-screen view directly would
// save a low-resolution image regardless of the source photo's quality.
const EXPORT_SINGLE_SIZE = 640;
const EXPORT_MINI_SIZE = 260;
const EXPORT_GRID_CELL_SIZE = 320;

const REEL_HOLES = Array.from({ length: 7 }, (_, i) => i);

// Shared across every voice bubble mounted in the thread — pressing play on
// one pauses whichever other voice message was playing, WhatsApp-style.
let activeVoicePlayer: AudioPlayer | null = null;

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function documentIcon(fileName: string | null | undefined): keyof typeof Ionicons.glyphMap {
  const ext = fileName?.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase();
  if (ext === 'pdf') return 'document-text-outline';
  if (ext && ['doc', 'docx'].includes(ext)) return 'document-outline';
  if (ext && ['xls', 'xlsx', 'csv'].includes(ext)) return 'grid-outline';
  if (ext && ['zip', 'rar', '7z'].includes(ext)) return 'archive-outline';
  return 'document-attach-outline';
}

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

export function MessageBubble({ message, isMine, myUserId, senderLabel, onRetry, onLongPress, onToggleReaction, onPressImage, onSaveGallery, onPressSpot, onPressLocation, onPressVideo, onPressDocument, polaroidRef, galleryRef, getAttachmentRef }: Props) {
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const grouped = groupReactions(message.reactions);
  const isImage = message.message_type === 'image';
  const isGallery = message.message_type === 'gallery';
  const isSpot = message.message_type === 'spot';
  const isLocation = message.message_type === 'location';
  const isVideo = message.message_type === 'video';
  const isVoice = message.message_type === 'voice';
  const isDocument = message.message_type === 'document';
  const imageSrc = message.local_uri || message.media_url;
  const attachments = message.attachments ?? [];
  const useGrid = message.gallery_layout === 'grid';
  const visibleAttachments = attachments.slice(0, useGrid ? 4 : 6);
  const extraCount = attachments.length - visibleAttachments.length;

  const voicePlayerRef = useRef<AudioPlayer | null>(null);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [voicePosition, setVoicePosition] = useState(0);

  useEffect(() => {
    return () => {
      if (activeVoicePlayer === voicePlayerRef.current) activeVoicePlayer = null;
      voicePlayerRef.current?.remove();
      voicePlayerRef.current = null;
    };
  }, []);

  function toggleVoicePlayback() {
    if (!imageSrc || message.pending) return;
    if (!voicePlayerRef.current) {
      const player = createAudioPlayer(imageSrc);
      player.addListener('playbackStatusUpdate', (status) => {
        setVoicePosition(status.currentTime);
        setVoicePlaying(status.playing);
        if (status.didJustFinish) {
          setVoicePosition(0);
          player.seekTo(0);
          if (activeVoicePlayer === player) activeVoicePlayer = null;
        }
      });
      voicePlayerRef.current = player;
    }
    const player = voicePlayerRef.current;
    if (player.playing) {
      player.pause();
    } else {
      if (activeVoicePlayer && activeVoicePlayer !== player) activeVoicePlayer.pause();
      activeVoicePlayer = player;
      player.play();
    }
  }

  const voiceDuration = message.voice_duration_seconds ?? 0;
  const voiceProgress = voiceDuration > 0 ? Math.min(voicePosition / voiceDuration, 1) : 0;

  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      {!!senderLabel && <Text style={styles.senderLabel}>{senderLabel}</Text>}
      {isGallery ? (
        <View style={styles.galleryOuter}>
        <View style={[useGrid ? styles.gridWrap : styles.galleryWrap, message.failed && styles.bubbleFailed]}>
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
                    onPress={src ? () => onPressImage?.(src, i) : undefined}
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
                      onPress={src ? () => onPressImage?.(src, i) : undefined}
                      style={[colIndex > 0 && styles.miniPolaroidOverlap, { transform: [{ rotate: `${rotate}deg` }] }]}>
                      <View style={styles.miniPolaroid}>
                        <View style={styles.miniPhotoWrap}>
                          {src ? (
                            <Image source={{ uri: src }} style={styles.image} contentFit="cover" />
                          ) : (
                            <View style={[styles.image, styles.imagePlaceholder]}><ActivityIndicator size="small" color={theme.color.gold} /></View>
                          )}
                          {showMore && <View style={styles.galleryMoreOverlay}><Text style={styles.galleryMoreText}>+{extraCount}</Text></View>}
                        </View>
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

        {/* Hidden, much larger off-screen renders — every save (whole gallery
            or one photo) targets these, never the small visible cluster/grid
            above, so saved images aren't capped at chat-bubble resolution. */}
        {(galleryRef || getAttachmentRef) && (
          <View style={styles.hiddenExportLayer} pointerEvents="none">
            {galleryRef && (
              <View ref={galleryRef} collapsable={false} style={[useGrid ? styles.exportGridWrap : styles.exportGalleryWrap]}>
                {useGrid ? (
                  <View style={styles.exportGridGroup}>
                    {visibleAttachments.map((att, i) => {
                      const src = att.local_uri || att.media_url;
                      return (
                        <View key={`xg-${att.id ?? att.media_path ?? i}`} style={styles.exportGridCell}>
                          {src && <Image source={{ uri: src }} style={styles.image} contentFit="cover" />}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  chunk(visibleAttachments, CLUSTER_COLS).map((row, rowIndex) => (
                    <View key={rowIndex} style={[styles.exportClusterRow, rowIndex > 0 && styles.exportClusterRowOverlap]}>
                      {row.map((att, colIndex) => {
                        const i = rowIndex * CLUSTER_COLS + colIndex;
                        const src = att.local_uri || att.media_url;
                        const rotate = CLUSTER_ROTATIONS[i % CLUSTER_ROTATIONS.length];
                        return (
                          <View key={`xc-${att.id ?? att.media_path ?? i}`} style={[styles.exportMiniPolaroid, colIndex > 0 && styles.exportMiniPolaroidOverlap, { transform: [{ rotate: `${rotate}deg` }] }]}>
                            <View style={styles.exportMiniPhotoWrap}>
                              {src && <Image source={{ uri: src }} style={styles.image} contentFit="cover" />}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ))
                )}
                {!!message.content && <Text style={styles.exportGalleryCaption}>{message.content}</Text>}
              </View>
            )}

            {getAttachmentRef && visibleAttachments.map((att, i) => {
              const src = att.local_uri || att.media_url;
              return (
                <View key={`xa-${att.id ?? att.media_path ?? i}`} ref={getAttachmentRef(i)} collapsable={false} style={styles.exportMiniPolaroidStandalone}>
                  <View style={styles.exportMiniPhotoWrap}>
                    {src && <Image source={{ uri: src }} style={styles.image} contentFit="cover" />}
                  </View>
                </View>
              );
            })}
          </View>
        )}
        </View>
      ) : isSpot ? (
        <View>
          <SpotPreviewCard
            title={message.shared_spot_title ?? null}
            photoUrl={message.shared_spot_photo_url ?? null}
            genre={message.shared_spot_genre ?? null}
            locationLabel={message.shared_spot_location_label ?? null}
            onPress={() => message.shared_spot_id && onPressSpot?.(message.shared_spot_id)}
          />
          {!!message.content && (
            <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs, styles.spotCaptionBubble]}>
              <Text style={[styles.text, isMine ? styles.textMine : styles.textTheirs]}>{message.content}</Text>
            </View>
          )}
          <Text style={[styles.time, styles.spotTime, isMine && styles.spotTimeMine]}>{time}</Text>
        </View>
      ) : isLocation ? (
        <View>
          <LocationPreviewCard
            label={message.location_label ?? null}
            lat={message.location_lat ?? 0}
            lng={message.location_lng ?? 0}
            onPress={() => {
              if (message.location_lat != null && message.location_lng != null) onPressLocation?.(message.location_lat, message.location_lng);
            }}
          />
          {!!message.content && (
            <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs, styles.spotCaptionBubble]}>
              <Text style={[styles.text, isMine ? styles.textMine : styles.textTheirs]}>{message.content}</Text>
            </View>
          )}
          <Text style={[styles.time, styles.spotTime, isMine && styles.spotTimeMine]}>{time}</Text>
        </View>
      ) : isVideo ? (
        <View>
          <Pressable
            onLongPress={onLongPress}
            delayLongPress={250}
            onPress={() => imageSrc && !message.pending && onPressVideo?.(imageSrc)}
            style={[styles.videoReelFrame, message.failed && styles.bubbleFailed]}>
            <View style={styles.reelPerforationRow}>
              {REEL_HOLES.map((i) => <View key={i} style={styles.reelHole} />)}
            </View>
            <View style={styles.reelBody}>
              {message.pending && !message.failed ? (
                <ActivityIndicator color={theme.color.cream} />
              ) : (
                <View style={styles.reelPlayBtn}><Ionicons name="play" size={20} color={theme.color.dusk} /></View>
              )}
              {message.video_duration_seconds != null && !message.pending && (
                <View style={styles.reelDurationBadge}>
                  <Text style={styles.reelDurationText}>{formatDuration(message.video_duration_seconds)}</Text>
                </View>
              )}
            </View>
            <View style={styles.reelPerforationRow}>
              {REEL_HOLES.map((i) => <View key={i} style={styles.reelHole} />)}
            </View>
          </Pressable>
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
      ) : isVoice ? (
        <View>
          <Pressable
            onLongPress={onLongPress}
            delayLongPress={250}
            onPress={toggleVoicePlayback}
            style={[styles.voiceCassette, message.failed && styles.bubbleFailed]}>
            <View style={styles.voicePlayBtn}>
              {(message.pending || (!imageSrc && !message.failed)) ? (
                <ActivityIndicator size="small" color={theme.color.dusk} />
              ) : (
                <Ionicons name={voicePlaying ? 'pause' : 'play'} size={16} color={theme.color.dusk} />
              )}
            </View>
            <View style={styles.voiceTrack}>
              <View style={styles.voiceTrackLine} />
              <View style={[styles.voiceTrackFill, { width: `${voiceProgress * 100}%` }]} />
              <View style={styles.voiceReelDot} />
              <View style={[styles.voiceReelDot, styles.voiceReelDotRight]} />
            </View>
            {message.voice_duration_seconds != null && (
              <Text style={styles.voiceDuration}>
                {formatDuration(voicePlaying || voicePosition > 0 ? Math.max(0, Math.round(voiceDuration - voicePosition)) : voiceDuration)}
              </Text>
            )}
          </Pressable>
          {message.failed ? (
            <Pressable onPress={onRetry} style={styles.polaroidRetryRow}>
              <Ionicons name="alert-circle-outline" size={11} color={theme.color.ember} />
              <Text style={styles.polaroidRetryText}>Failed — tap to retry</Text>
            </Pressable>
          ) : !message.pending ? (
            <Text style={styles.galleryMeta}>{time}</Text>
          ) : null}
        </View>
      ) : isDocument ? (
        <View>
          <Pressable
            onLongPress={onLongPress}
            delayLongPress={250}
            onPress={() => imageSrc && !message.pending && onPressDocument?.(imageSrc)}
            style={[styles.documentCard, message.failed && styles.bubbleFailed]}>
            <View style={styles.documentIconWrap}>
              {message.pending && !message.failed ? (
                <ActivityIndicator size="small" color={theme.color.dusk} />
              ) : (
                <Ionicons name={documentIcon(message.file_name)} size={20} color={theme.color.dusk} />
              )}
            </View>
            <View style={styles.documentInfo}>
              <Text style={styles.documentName} numberOfLines={1}>{message.file_name ?? 'File'}</Text>
              {message.file_size != null && <Text style={styles.documentSize}>{formatFileSize(message.file_size)}</Text>}
            </View>
            {!message.pending && <Ionicons name="open-outline" size={16} color={theme.color.muted} />}
          </Pressable>
          {message.failed ? (
            <Pressable onPress={onRetry} style={styles.polaroidRetryRow}>
              <Ionicons name="alert-circle-outline" size={11} color={theme.color.ember} />
              <Text style={styles.polaroidRetryText}>Failed — tap to retry</Text>
            </Pressable>
          ) : !message.pending ? (
            <Text style={styles.galleryMeta}>{time}</Text>
          ) : null}
        </View>
      ) : (
        <>
        <Pressable onLongPress={onLongPress} delayLongPress={250} onPress={isImage && imageSrc ? () => onPressImage?.(imageSrc) : undefined}>
          {isImage ? (
            <View style={[styles.polaroidFrame, message.failed && styles.bubbleFailed]}>
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

        {isImage && polaroidRef && (
          <View style={styles.hiddenExportLayer} pointerEvents="none">
            <View ref={polaroidRef} collapsable={false} style={styles.exportPolaroidFrame}>
              <View style={styles.exportPolaroidPhotoWrap}>
                {imageSrc && <Image source={{ uri: imageSrc }} style={styles.image} contentFit="cover" />}
              </View>
              {!!message.content && <Text style={styles.exportPolaroidCaption}>{message.content}</Text>}
              <Text style={styles.exportPolaroidMeta}>{time}</Text>
            </View>
          </View>
        )}
        </>
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

      {!isImage && !isGallery && !isSpot && !isLocation && !isVideo && !isVoice && !isDocument && (
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
  senderLabel: { fontFamily: theme.font.mono, fontSize: 10, color: theme.color.gold, marginBottom: 3, marginLeft: 4 },
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
  hiddenExportLayer: { position: 'absolute', top: -3000, left: 0, flexDirection: 'row', gap: 4 },
  exportPolaroidFrame: { backgroundColor: theme.color.cream, padding: 28, paddingBottom: 46, borderRadius: 14, width: EXPORT_SINGLE_SIZE + 56 },
  exportPolaroidPhotoWrap: { width: EXPORT_SINGLE_SIZE, height: EXPORT_SINGLE_SIZE, borderRadius: 6, overflow: 'hidden', backgroundColor: theme.color.surface2 },
  exportPolaroidCaption: { fontFamily: theme.font.displayItalic, fontSize: 30, color: theme.color.dusk, marginTop: 20, textAlign: 'center' },
  exportPolaroidMeta: { fontFamily: theme.font.mono, fontSize: 18, color: '#8a7f6e', textAlign: 'center', marginTop: 10 },
  exportGalleryWrap: { padding: 32, backgroundColor: theme.color.dusk, borderRadius: 18 },
  exportGridWrap: { padding: 12, backgroundColor: theme.color.dusk, borderRadius: 18 },
  exportGridGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, borderRadius: theme.radius.lg, overflow: 'hidden' },
  exportGridCell: { width: EXPORT_GRID_CELL_SIZE, height: EXPORT_GRID_CELL_SIZE, backgroundColor: theme.color.surface2 },
  exportClusterRow: { flexDirection: 'row' },
  exportClusterRowOverlap: { marginTop: -78 },
  exportMiniPolaroid: { backgroundColor: theme.color.cream, padding: 16, paddingBottom: 32, borderRadius: 12, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  exportMiniPolaroidStandalone: { backgroundColor: theme.color.cream, padding: 16, paddingBottom: 32, borderRadius: 12 },
  exportMiniPolaroidOverlap: { marginLeft: -68 },
  exportMiniPhotoWrap: { width: EXPORT_MINI_SIZE, height: EXPORT_MINI_SIZE, borderRadius: 8, overflow: 'hidden', backgroundColor: theme.color.surface2 },
  exportGalleryCaption: { fontFamily: theme.font.displayItalic, fontSize: 26, color: theme.color.cream, marginTop: 24, textAlign: 'center' },
  spotCaptionBubble: { marginTop: 6, borderBottomRightRadius: theme.radius.md, borderBottomLeftRadius: theme.radius.md },
  spotTime: { marginTop: 4, paddingHorizontal: 4 },
  spotTimeMine: { textAlign: 'right' },
  galleryMoreOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(20,23,31,0.55)', alignItems: 'center', justifyContent: 'center' },
  galleryMoreText: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.cream },
  galleryCaption: { fontFamily: theme.font.displayItalic, fontSize: 12.5, color: theme.color.cream, marginTop: 10, textAlign: 'center' },
  galleryMeta: { fontFamily: theme.font.mono, fontSize: 9, color: theme.color.muted, textAlign: 'center', marginTop: 6 },
  videoReelFrame: { width: 200, borderRadius: theme.radius.sm, overflow: 'hidden', backgroundColor: '#0C0D10', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5 },
  reelPerforationRow: { flexDirection: 'row', justifyContent: 'space-evenly', paddingVertical: 5, backgroundColor: '#050506' },
  reelHole: { width: 6, height: 6, borderRadius: 1.5, backgroundColor: theme.color.surface2 },
  reelBody: { height: 174, alignItems: 'center', justifyContent: 'center' },
  reelPlayBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  reelDurationBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingVertical: 2, paddingHorizontal: 7 },
  reelDurationText: { fontFamily: theme.font.mono, fontSize: 10, color: theme.color.cream },
  voiceCassette: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 210, backgroundColor: '#20242F', borderRadius: 22, paddingVertical: 10, paddingHorizontal: 12, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  voicePlayBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center' },
  voiceTrack: { flex: 1, height: 20, justifyContent: 'center' },
  voiceTrackLine: { position: 'absolute', left: 6, right: 6, height: 3, borderRadius: 1.5, backgroundColor: theme.color.surface2 },
  voiceTrackFill: { position: 'absolute', left: 6, height: 3, borderRadius: 1.5, backgroundColor: theme.color.gold },
  voiceReelDot: { position: 'absolute', left: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: theme.color.surface2 },
  voiceReelDotRight: { left: undefined, right: 0 },
  voiceDuration: { fontFamily: theme.font.mono, fontSize: 10, color: theme.color.muted },
  documentCard: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 220, backgroundColor: '#20242F', borderRadius: theme.radius.sm, paddingVertical: 12, paddingHorizontal: 12 },
  documentIconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center' },
  documentInfo: { flex: 1 },
  documentName: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.cream },
  documentSize: { fontFamily: theme.font.mono, fontSize: 10, color: theme.color.muted, marginTop: 2 },
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
