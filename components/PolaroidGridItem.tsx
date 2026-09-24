/**
 * PolaroidGridItem, one tappable polaroid tile in a 3-column photo grid.
 *
 * Purpose: the "Captures" and "Saved" grids (own Profile tab, public
 * profiles at /user/[id], and /saved), plus the matching loading skeleton.
 * The signature polaroid look from .claude/rules/ui-ux.md, sized for grids.
 *
 * How it works:
 * - Each tile takes one third of the row (`flex: 1 / 3`) with a fixed aspect
 *   ratio, so rows line up and heights stay predictable.
 * - The cream frame is rotated a little; `rotationFor(index)` hands out a
 *   repeating pattern of tilts so the grid looks hand-placed but is the
 *   same every time it renders.
 * - Shows a camera icon when there is no photo, and an optional one-line
 *   caption (callers pass the spot's genre).
 */
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

/** Tilt pattern in degrees, cycled across the grid. */
const ROTATIONS = [-2, 1.5, -1];
/**
 * Tilt for the tile at `index` in a list. Deterministic, so a tile keeps its
 * angle across re-renders and re-fetches.
 */
export function rotationFor(index: number) {
  return ROTATIONS[index % ROTATIONS.length];
}

/**
 * Grid tile. `onPress` usually navigates to the spot detail screen; the tile
 * dims while pressed as feedback.
 */
export function PolaroidGridItem({ photoUrl, caption, rotate = 0, onPress }: { photoUrl: string | null; caption?: string | null; rotate?: number; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.gridItem, pressed && { opacity: 0.75 }]} onPress={onPress}>
      <View style={[styles.frame, { transform: [{ rotate: `${rotate}deg` }] }]}>
        {photoUrl ? <Image source={{ uri: photoUrl }} style={styles.image} /> : <View style={styles.fallback}><Ionicons name="camera-outline" size={16} color={theme.color.muted} /></View>}
        {caption ? <Text style={styles.caption} numberOfLines={1}>{caption}</Text> : null}
      </View>
    </Pressable>
  );
}

// Colors and fonts come from theme tokens in constants/theme.ts (the shadow
// color is a black literal). `gridItem` is the outer cell; `frame` is the
// rotated cream card inside it.
const styles = StyleSheet.create({
  gridItem: { flex: 1 / 3, aspectRatio: 0.85, padding: 4 },
  frame: { flex: 1, backgroundColor: theme.color.cream, borderRadius: 3, padding: 4, paddingBottom: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  image: { flex: 1, borderRadius: 1 },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.surface2 },
  caption: { fontFamily: theme.font.displayItalic, fontSize: 8, color: theme.color.dusk, textAlign: 'center', marginTop: 3 },
});