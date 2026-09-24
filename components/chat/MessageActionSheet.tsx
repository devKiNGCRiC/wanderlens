/**
 * MessageActionSheet, the long-press popup for a single chat message.
 *
 * Purpose: in a chat thread (app/chat/[id].tsx), long-pressing a message
 * bubble opens this centred card with a row of quick-reaction emoji, a
 * Reply action, and, for single-photo messages only, "Save photo" and
 * "Save as polaroid".
 *
 * How it works:
 * - Stateless and callback-driven. The screen decides which message it is
 *   for (its actionSheetFor state) and wires each callback to that message:
 *   onReact toggles a reaction, onReply sets the reply target, and the save
 *   callbacks download the original or capture the styled polaroid render.
 * - Every action runs its callback and then closes the sheet.
 * - Save rows appear only when showSaveOptions is true AND the matching
 *   callback was provided.
 * - Uses a "fade" centred modal rather than a bottom sheet, unlike
 *   AttachMenu / ConversationOptionsSheet.
 */
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

/** The fixed set of one-tap reactions offered at the top of the sheet. */
const QUICK_EMOJI = ['❤️', '😂', '👍', '😮', '😢', '🙏'];

/**
 * visible / onClose: controlled by the parent.
 * onReply: start a reply to this message.
 * onReact: add or remove the given emoji reaction (the parent toggles).
 * showSaveOptions: true for image messages; enables the save rows below.
 * onSavePhoto / onSaveAsPolaroid: optional save handlers.
 */
type Props = {
  visible: boolean;
  onClose: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
  showSaveOptions?: boolean;
  onSavePhoto?: () => void;
  onSaveAsPolaroid?: () => void;
};

/** Renders the per-message action card. */
export function MessageActionSheet({ visible, onClose, onReply, onReact, showSaveOptions, onSavePhoto, onSaveAsPolaroid }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Backdrop: tap outside to dismiss */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Card: stops propagation so taps inside don't dismiss it */}
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Quick-reaction emoji row */}
          <View style={styles.emojiRow}>
            {QUICK_EMOJI.map((emoji) => (
              <Pressable key={emoji} onPress={() => { onReact(emoji); onClose(); }} style={styles.emojiBtn}>
                <Text style={styles.emoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          {/* Reply is always available */}
          <Pressable style={styles.row} onPress={() => { onReply(); onClose(); }}>
            <Ionicons name="arrow-undo-outline" size={18} color={theme.color.cream} />
            <Text style={styles.rowText}>Reply</Text>
          </Pressable>
          {/* Save rows: image messages only. "Save photo" saves the original
              file; "Save as polaroid" saves the framed render MessageBubble
              keeps off-screen. */}
          {showSaveOptions && onSavePhoto && (
            <Pressable style={styles.row} onPress={() => { onSavePhoto(); onClose(); }}>
              <Ionicons name="download-outline" size={18} color={theme.color.cream} />
              <Text style={styles.rowText}>Save photo</Text>
            </Pressable>
          )}
          {showSaveOptions && onSaveAsPolaroid && (
            <Pressable style={styles.row} onPress={() => { onSaveAsPolaroid(); onClose(); }}>
              <Ionicons name="images-outline" size={18} color={theme.color.cream} />
              <Text style={styles.rowText}>Save as polaroid</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Styles use design tokens from constants/theme.ts.
const styles = StyleSheet.create({
  // Centred card over a dimmed backdrop
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 30 },
  sheet: { backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, padding: 16, width: '100%', maxWidth: 320, borderWidth: 1, borderColor: theme.color.surface2 },
  // Emoji row
  emojiRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  emojiBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.surface2 },
  emoji: { fontSize: 20 },
  // Action rows, separated by a top border
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.color.surface2 },
  rowText: { fontFamily: theme.font.bodyRegular, fontSize: 14, color: theme.color.cream },
});
