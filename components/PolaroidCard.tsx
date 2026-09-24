/**
 * PolaroidCard, a tilted instant-photo style card for horizontal strips.
 *
 * Purpose: one of the app's signature visuals (see .claude/rules/ui-ux.md).
 * Used in the Feed tab's personalised horizontal strips (app/(tabs)/index.tsx),
 * where the caller alternates `rotate` so neighbouring cards lean different ways.
 * For the 3-column grids, see PolaroidGridItem instead.
 *
 * How it works: a fixed-width cream frame holding the photo (or an empty
 * placeholder), a title in italic display font, and an optional mono
 * metadata line joining `meta` and `distance` with a middle dot.
 */
import { View, Text, Image, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

/**
 * `meta` and `distance` are free text (either may be ''); `rotate` is the
 * tilt in degrees; `photoUrl` null/undefined shows an empty grey square.
 */
type Props = {
  title: string;
  meta: string;
  distance: string;
  rotate?: number;
  photoUrl?: string | null;
};

/** Renders the card. Has no press handling; the caller wraps it if tappable. */
export function PolaroidCard({ title, meta, distance, rotate = 0, photoUrl }: Props) {
  // The metadata line is skipped entirely when both parts are empty, and
  // filter(Boolean) drops whichever one is empty so no stray dot appears.
  return (
    <View style={[styles.frame, { transform: [{ rotate: `${rotate}deg` }] }]}>
      {photoUrl ? <Image source={{ uri: photoUrl }} style={styles.photo} /> : <View style={styles.photo} />}
      <Text style={styles.caption}>{title}</Text>
      {!!(meta || distance) && <Text style={styles.metaLine}>{[meta, distance].filter(Boolean).join(' · ')}</Text>}
    </View>
  );
}

// Colors, fonts and radii mostly come from theme tokens in constants/theme.ts.
// Exceptions: the black shadow color, and the metadata color '#8a7f6e',
// which matches the `theme.color.polaroidMuted` token but is written as a literal.
const styles = StyleSheet.create({
  frame: { backgroundColor: theme.color.cream, padding: 8, paddingBottom: 14, borderRadius: theme.radius.sm, width: 150, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  photo: { width: '100%', height: 128, borderRadius: 2, backgroundColor: theme.color.surface2 },
  caption: { fontFamily: theme.font.displayItalic, fontSize: 13, color: theme.color.dusk, marginTop: 9, textAlign: 'center' },
  metaLine: { fontFamily: theme.font.mono, fontSize: 9, color: '#8a7f6e', textAlign: 'center', marginTop: 2 },
});