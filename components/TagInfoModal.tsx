/**
 * TagInfoModal, a small popup explaining what a profile tag means.
 *
 * Purpose: on the Profile tab (app/(tabs)/profile.tsx), tapping a tag such
 * as a user type, travel style or photography genre opens this card with a
 * plain-language description.
 *
 * How it works:
 * - The parent passes the tapped tag string, or null when nothing is open;
 *   `tag` doubles as the visibility flag, so there's no separate `visible` prop.
 * - Descriptions come from the static TAG_INFO map in constants/tagInfo.ts,
 *   keyed by the exact stored tag string; unknown tags get a fallback line.
 * - "Got it" or a tap anywhere on the backdrop calls `onClose`, which the
 *   parent uses to set the tag back to null.
 */
import { Modal, Pressable, View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { TAG_INFO } from '@/constants/tagInfo';

/**
 * Tag explanation modal.
 * @param tag - the tag to explain, or null to render nothing.
 * @param onClose - called when the user dismisses the card.
 */
export function TagInfoModal({ tag, onClose }: { tag: string | null; onClose: () => void }) {
  // Nothing selected: render nothing at all (the Modal isn't even mounted).
  if (!tag) return null;
  const description = TAG_INFO[tag] ?? 'No description available yet.';
  return (
    <Modal visible={!!tag} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.card}>
          <Text style={styles.tagName}>{tag}</Text>
          <Text style={styles.description}>{description}</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Got it</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

// Colors, fonts and radii come from theme tokens in constants/theme.ts.
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card: { backgroundColor: theme.color.surface, borderRadius: theme.radius.md, padding: 20, width: '100%', borderWidth: 1, borderColor: theme.color.surface2 },
  tagName: { fontFamily: theme.font.display, fontSize: 18, color: theme.color.gold },
  description: { fontFamily: theme.font.bodyRegular, fontSize: 14, color: theme.color.cream, marginTop: 10, lineHeight: 20 },
  closeBtn: { marginTop: 18, alignSelf: 'flex-end' },
  closeText: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted },
});