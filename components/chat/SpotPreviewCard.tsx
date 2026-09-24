/**
 * SpotPreviewCard, a compact tappable card for a Wanderlens spot shared into a chat.
 *
 * Purpose: when someone shares a community photo spot into a conversation
 * (message_type 'spot'), the message renders as this card instead of plain
 * text. Used by MessageBubble (in the thread) and MessageSearchOverlay
 * (in search results). Tapping it opens the spot detail screen, via a
 * callback the parent supplies.
 *
 * How it works:
 * - All data arrives as props; the spot fields are denormalised onto the
 *   message row (shared_spot_title, shared_spot_photo_url, and so on) so
 *   this card never fetches anything itself.
 * - Every field is nullable (the spot may have been deleted, or the column
 *   left empty), so each has a fallback: a blank thumbnail, a generic title,
 *   and "Tap to view" when there is no genre or location label.
 * - The two small gold corner pieces over the thumbnail are the app's
 *   viewfinder-bracket motif (see .claude/rules/ui-ux.md).
 */
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

/**
 * The shared spot's display fields, all nullable, plus the tap handler.
 * The parent decides what a tap does (normally router.push to /spot/[id]).
 */
type Props = {
  title: string | null;
  photoUrl: string | null;
  genre: string | null;
  locationLabel: string | null;
  onPress: () => void;
};

/**
 * Row layout: framed thumbnail on the left, title and meta line in the
 * middle, chevron on the right. Width is fixed (220) so it sits neatly
 * inside a chat bubble column.
 */
export function SpotPreviewCard({ title, photoUrl, genre, locationLabel, onPress }: Props) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      {/* Thumbnail: expo-image when a photo URL exists, otherwise an empty
          placeholder of the same size, then the two viewfinder corners. */}
      <View style={styles.thumbWrap}>
        {photoUrl ? <Image source={{ uri: photoUrl }} style={styles.thumb} /> : <View style={styles.thumb} />}
        <View style={styles.thumbCornerTL} />
        <View style={styles.thumbCornerBR} />
      </View>
      {/* Text: title, then "genre · location" in mono. filter(Boolean) drops
          whichever of the two is missing so there is no stray separator. */}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{title || 'A spot on Wanderlens'}</Text>
        <Text style={styles.meta} numberOfLines={1}>{[genre, locationLabel].filter(Boolean).join(' · ') || 'Tap to view'}</Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={theme.color.gold} />
    </Pressable>
  );
}

// Styles use design tokens from constants/theme.ts. LocationPreviewCard
// uses the same card/thumbnail/corner styles so the two cards match.
const styles = StyleSheet.create({
  // Card shell
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, padding: 8, width: 220 },
  // Thumbnail and its viewfinder corner brackets (offset -2 so they sit just outside the photo)
  thumbWrap: { width: 46, height: 46, position: 'relative' },
  thumb: { width: '100%', height: '100%', borderRadius: 6, backgroundColor: theme.color.surface2 },
  thumbCornerTL: { position: 'absolute', top: -2, left: -2, width: 10, height: 10, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderColor: theme.color.gold },
  thumbCornerBR: { position: 'absolute', bottom: -2, right: -2, width: 10, height: 10, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderColor: theme.color.gold },
  // Text column
  body: { flex: 1 },
  title: { fontFamily: theme.font.body, fontSize: 13.5, color: theme.color.cream },
  meta: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.gold, marginTop: 3 },
});
