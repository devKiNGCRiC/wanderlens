/**
 * LocationPreviewCard, a compact tappable card for a location shared in a chat.
 *
 * Purpose: renders a message of type 'location' (a raw coordinate the sender
 * shared, not a community spot). Used by MessageBubble in the thread and by
 * MessageSearchOverlay in search results. Tapping it hands the coordinate to
 * the parent, which opens the device's maps app via openInMaps() in lib/chat.ts.
 *
 * How it works:
 * - Visually mirrors SpotPreviewCard (same size, same viewfinder corners)
 *   but shows a location pin icon instead of a photo.
 * - Shows the optional label (fallback "Shared location") and the
 *   coordinates rounded to 4 decimal places in the mono "data" font.
 * - Stateless; the parent owns what a tap does.
 */
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

/**
 * label: optional place name the sender attached (null if none).
 * lat / lng: the shared coordinate. Callers pass 0 when the column is null.
 * onPress: tap handler, normally opens the external maps app.
 */
type Props = {
  label: string | null;
  lat: number;
  lng: number;
  onPress: () => void;
};

/**
 * Row layout: framed pin icon, label plus coordinates, and an "open"
 * icon hinting that the tap leaves the app for the maps app.
 */
export function LocationPreviewCard({ label, lat, lng, onPress }: Props) {
  return (
    <Pressable style={styles.card} onPress={onPress}>
      {/* Pin "thumbnail" with the viewfinder corner brackets */}
      <View style={styles.thumbWrap}>
        <View style={styles.thumb}><Ionicons name="location" size={20} color={theme.color.gold} /></View>
        <View style={styles.thumbCornerTL} />
        <View style={styles.thumbCornerBR} />
      </View>
      {/* Label, then coordinates to 4 decimals (roughly 11 m precision) */}
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{label || 'Shared location'}</Text>
        <Text style={styles.meta} numberOfLines={1}>{lat.toFixed(4)}, {lng.toFixed(4)}</Text>
      </View>
      <Ionicons name="open-outline" size={16} color={theme.color.gold} />
    </Pressable>
  );
}

// Styles use design tokens from constants/theme.ts and deliberately match
// SpotPreviewCard's card, thumbnail and corner styles.
const styles = StyleSheet.create({
  // Card shell
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, padding: 8, width: 220 },
  // Icon tile and viewfinder corner brackets
  thumbWrap: { width: 46, height: 46, position: 'relative' },
  thumb: { width: '100%', height: '100%', borderRadius: 6, backgroundColor: theme.color.surface2, alignItems: 'center', justifyContent: 'center' },
  thumbCornerTL: { position: 'absolute', top: -2, left: -2, width: 10, height: 10, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderColor: theme.color.gold },
  thumbCornerBR: { position: 'absolute', bottom: -2, right: -2, width: 10, height: 10, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderColor: theme.color.gold },
  // Text column
  body: { flex: 1 },
  title: { fontFamily: theme.font.body, fontSize: 13.5, color: theme.color.cream },
  meta: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.gold, marginTop: 3 },
});
