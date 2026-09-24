/**
 * RequestBanner, the "wants to message you" notice in a chat thread.
 *
 * Purpose: shown by app/chat/[id].tsx above the composer when the current
 * user's membership in the conversation is still in the 'request' state,
 * i.e. someone they haven't chatted with yet started the thread. It tells
 * the user what is going on and gives them an explicit Accept button.
 *
 * How it works:
 * - Purely presentational: it only renders the name and calls onAccept.
 * - The screen's acceptRequest() does the actual write (updates the
 *   caller's conversation_members row to status 'accepted') and then
 *   hides this banner by flipping its local myStatus.
 * - The copy says "Replying accepts the request" because the screen's send
 *   functions also flip myStatus from 'request' to 'accepted' after a
 *   successful send.
 */
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

/**
 * name: display name of the person (or group) who started the thread.
 * onAccept: called when the Accept button is tapped.
 */
type Props = {
  name: string;
  onAccept: () => void;
};

/**
 * Renders an inline card with an explanation line and a gold Accept button.
 * Has no state of its own; all behaviour lives in the parent's onAccept.
 */
export function RequestBanner({ name, onAccept }: Props) {
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>{name} wants to message you. Replying accepts the request.</Text>
      <Pressable onPress={onAccept} style={styles.acceptBtn}>
        <Text style={styles.acceptText}>Accept</Text>
      </Pressable>
    </View>
  );
}

// Styles use design tokens (colors, fonts, radii) from constants/theme.ts.
const styles = StyleSheet.create({
  banner: { margin: 14, padding: 14, borderRadius: theme.radius.md, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, gap: 10 },
  text: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted, lineHeight: 18 },
  acceptBtn: { backgroundColor: theme.color.gold, borderRadius: theme.radius.sm, paddingVertical: 9, alignItems: 'center' },
  acceptText: { fontFamily: theme.font.body, fontSize: 12.5, color: theme.color.dusk },
});
