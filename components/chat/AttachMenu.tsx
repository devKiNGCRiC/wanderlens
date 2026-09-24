/**
 * AttachMenu, the bottom sheet of attachment types opened by the composer's "+" button.
 *
 * Purpose: lets the user pick what to attach to a chat message (photo,
 * camera, video, document, audio, location). Rendered only by
 * MessageComposer, which builds the option list from whichever pick
 * callbacks the chat screen (app/chat/[id].tsx) passed it.
 *
 * How it works:
 * - A transparent React Native <Modal> that slides up from the bottom.
 * - Tapping the dimmed backdrop closes it. The sheet itself is a nested
 *   Pressable that calls e.stopPropagation(), so taps inside the sheet do
 *   not bubble up to the backdrop and close it by accident.
 * - Options are laid out in a 3-column wrapping grid of coloured circles.
 * - Choosing an option closes the sheet first, then runs its onPress.
 */
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

/**
 * One tile in the attach grid. Exported so MessageComposer can build the list.
 * key: stable React key. icon: an Ionicons glyph name (type-checked against
 * the icon set). color / iconColor: circle fill and glyph colour, passed as
 * theme tokens by the caller. onPress: the pick action to run.
 */
export type AttachMenuOption = {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  iconColor: string;
  onPress: () => void;
};

/** Visibility is controlled by the parent; onClose also fires on Android back (onRequestClose). */
type Props = {
  visible: boolean;
  onClose: () => void;
  options: AttachMenuOption[];
};

/** Renders the attach sheet. Stateless; the parent owns `visible`. */
export function AttachMenu({ visible, onClose, options }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Backdrop: tap outside the sheet to dismiss */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Sheet: swallows its own taps so they don't reach the backdrop */}
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Decorative drag handle (there is no drag gesture wired up) */}
          <View style={styles.handle} />
          {/* Option grid. A tap closes the sheet, then runs the option's
              action (which usually opens a picker or permission prompt). */}
          <View style={styles.grid}>
            {options.map((opt) => (
              <Pressable key={opt.key} style={styles.cell} onPress={() => { onClose(); opt.onPress(); }}>
                <View style={[styles.iconCircle, { backgroundColor: opt.color }]}>
                  <Ionicons name={opt.icon} size={24} color={opt.iconColor} />
                </View>
                <Text style={styles.cellLabel}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Styles use design tokens from constants/theme.ts (the backdrop's
// translucent black is the one literal).
const styles = StyleSheet.create({
  // Modal backdrop and sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.color.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 34 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.color.surface2, alignSelf: 'center', marginBottom: 18 },
  // 3-column grid: each cell is a third of the row width
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.33%', alignItems: 'center', gap: 8, paddingVertical: 12 },
  iconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  cellLabel: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.cream },
});
