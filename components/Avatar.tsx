/**
 * Avatar, a round profile picture with an initial-letter fallback.
 *
 * Purpose: the shared user avatar across the feed, spot detail, chat,
 * notifications, group screens, edit-profile and some skeletons.
 *
 * How it works:
 * - If `uri` is set, shows that image cropped to a circle.
 * - Otherwise shows the first letter of `label` in the display font on a
 *   gold circle, so users without a photo still get a recognisable mark.
 * - `size` drives width, height, corner radius and the fallback font size.
 */
import { View, Text, Image, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

/**
 * `uri` is the avatar image URL (null/undefined when the user has none);
 * `label` is usually the display name or username; `size` is the diameter in points.
 */
type Props = {
  uri?: string | null;
  label: string;
  size?: number;
};

/** Renders the circular avatar. Default size is 42pt. */
export function Avatar({ uri, label, size = 42 }: Props) {
  // Empty label -> '' -> fall back to '?'.
  const initial = label.charAt(0).toUpperCase() || '?';
  // Size-dependent values (diameter, radius, font size) are inline because
  // they change per call; the static parts live in the StyleSheet.
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}>
      {uri ? (
        <Image source={{ uri }} style={styles.image} />
      ) : (
        <Text style={[styles.text, { fontSize: size * 0.4 }]}>{initial}</Text>
      )}
    </View>
  );
}

// Colors and font come from theme tokens in constants/theme.ts.
const styles = StyleSheet.create({
  circle: {
    backgroundColor: theme.color.gold,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  text: { fontFamily: theme.font.display, color: theme.color.dusk },
});
