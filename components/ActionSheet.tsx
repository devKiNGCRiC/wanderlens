/**
 * ActionSheet, a bottom sheet listing tappable options plus Cancel.
 *
 * Purpose: the app's shared "more options" menu. Used for overflow menus on
 * the Profile and Chat tabs, spot detail, public profiles, chat/group
 * threads, notes, notifications and the chat message action sheet.
 *
 * How it works:
 * - A transparent React Native `<Modal>` that slides up from the bottom.
 * - Tapping the dimmed backdrop closes it; the inner sheet swallows taps
 *   (`stopPropagation`) so tapping inside doesn't close it by accident.
 * - Choosing an option closes the sheet first, then runs that option's
 *   `onPress`, so the caller never has to close it manually.
 * - Destructive options (delete, block, ...) are drawn in `ember`.
 *
 * Why not Alert.alert: see the comment above the component.
 */
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

/**
 * One row in the sheet. `key` must be unique within the sheet; `icon` is an
 * optional Ionicons name; `destructive` paints the row in the warning color.
 */
export type ActionSheetOption = {
  key: string;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
};

/** `visible`/`onClose` are owned by the parent screen; `title` is an optional small header line. */
type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  options: ActionSheetOption[];
};

// Android's native Alert.alert only reliably renders up to 3 buttons — extra
// ones (including Cancel) silently disappear. Anything with more than a
// yes/no choice belongs here instead, not in Alert.alert.
export function ActionSheet({ visible, onClose, title, options }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Grab handle, purely decorative (the sheet isn't draggable) */}
          <View style={styles.handle} />
          {title && <Text style={styles.title}>{title}</Text>}
          {/* Option rows: close first, then run the action */}
          {options.map((opt) => (
            <Pressable key={opt.key} style={styles.row} onPress={() => { onClose(); opt.onPress(); }}>
              {opt.icon && <Ionicons name={opt.icon} size={19} color={opt.destructive ? theme.color.ember : theme.color.cream} />}
              <Text style={[styles.rowText, opt.destructive && styles.rowTextDestructive]}>{opt.label}</Text>
            </Pressable>
          ))}
          {/* Always-present Cancel row, separated by a hairline */}
          <Pressable style={styles.cancelRow} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Colors, fonts and radii come from the theme tokens in constants/theme.ts.
// The backdrop's translucent black is the one literal (shared with FilterSheet).
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.color.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.color.surface2, alignSelf: 'center', marginBottom: 14 },
  title: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, textAlign: 'center', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  rowText: { fontFamily: theme.font.bodyRegular, fontSize: 14.5, color: theme.color.cream },
  rowTextDestructive: { color: theme.color.ember },
  cancelRow: { paddingVertical: 13, marginTop: 4, borderTopWidth: 1, borderTopColor: theme.color.surface2, alignItems: 'center' },
  cancelText: { fontFamily: theme.font.body, fontSize: 14.5, color: theme.color.muted },
});
