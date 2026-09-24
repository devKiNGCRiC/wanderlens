/**
 * ConversationOptionsSheet, the long-press menu for a conversation in the chat list.
 *
 * Purpose: when the user long-presses a ConversationRow on the Chat tab
 * (app/(tabs)/chat.tsx), this bottom sheet offers pin, favourite, mute,
 * mark unread, archive, clear and delete for that conversation.
 *
 * How it works:
 * - Toggle-style options (pin/unpin, mute/unmute, and so on) flip their
 *   label, icon and action based on the conversation's current flags,
 *   which the parent passes in as isPinned / isMuted / isFavorite / isArchived.
 * - This component does no network work. It reports the chosen
 *   ConversationAction via onSelect; the Chat tab's handleAction() maps it
 *   to Supabase RPCs such as set_conversation_flag and mark_conversation_unread.
 * - Same modal pattern as AttachMenu: backdrop tap closes, the inner sheet
 *   stops tap propagation so taps inside it don't close it.
 */
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

/**
 * Every action the sheet can report. Exported so the Chat tab's handler
 * can switch over it with full type checking.
 */
export type ConversationAction =
  | 'pin' | 'unpin' | 'mute' | 'unmute' | 'favorite' | 'unfavorite'
  | 'archive' | 'unarchive' | 'markUnread' | 'clear' | 'delete';

/** One row in the sheet. `destructive` renders it in ember (used for Delete). */
type Option = { action: ConversationAction; label: string; icon: keyof typeof Ionicons.glyphMap; destructive?: boolean };

/**
 * visible / onClose: controlled by the parent.
 * onSelect: receives the chosen action.
 * is* flags: the conversation's current state, used to pick each toggle's direction.
 */
type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (action: ConversationAction) => void;
  isPinned: boolean;
  isMuted: boolean;
  isFavorite: boolean;
  isArchived: boolean;
};

/** Renders the options sheet for one conversation. Stateless. */
export function ConversationOptionsSheet({ visible, onClose, onSelect, isPinned, isMuted, isFavorite, isArchived }: Props) {
  // Build the row list on each render. Each toggle offers the opposite of
  // the current state, e.g. a pinned chat shows "Unpin".
  const options: Option[] = [
    { action: isPinned ? 'unpin' : 'pin', label: isPinned ? 'Unpin' : 'Pin', icon: 'pin-outline' },
    { action: isFavorite ? 'unfavorite' : 'favorite', label: isFavorite ? 'Remove from favorites' : 'Add to favorites', icon: isFavorite ? 'star' : 'star-outline' },
    { action: isMuted ? 'unmute' : 'mute', label: isMuted ? 'Unmute' : 'Mute', icon: isMuted ? 'notifications-outline' : 'notifications-off-outline' },
    { action: 'markUnread', label: 'Mark as unread', icon: 'mail-unread-outline' },
    { action: isArchived ? 'unarchive' : 'archive', label: isArchived ? 'Unarchive' : 'Archive', icon: 'archive-outline' },
    { action: 'clear', label: 'Clear chat', icon: 'brush-outline' },
    { action: 'delete', label: 'Delete chat', icon: 'trash-outline', destructive: true },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Backdrop: tap outside to dismiss */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Sheet: stops propagation so inside taps don't dismiss */}
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          {/* Option rows: report the action to the parent, then close */}
          {options.map((opt) => (
            <Pressable
              key={opt.action}
              style={styles.row}
              onPress={() => { onSelect(opt.action); onClose(); }}>
              <Ionicons name={opt.icon} size={19} color={opt.destructive ? theme.color.ember : theme.color.cream} />
              <Text style={[styles.rowText, opt.destructive && styles.rowTextDestructive]}>{opt.label}</Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Styles use design tokens from constants/theme.ts.
const styles = StyleSheet.create({
  // Modal backdrop, sheet and drag-handle bar
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.color.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.color.surface2, alignSelf: 'center', marginBottom: 16 },
  // Option rows
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  rowText: { fontFamily: theme.font.bodyRegular, fontSize: 14.5, color: theme.color.cream },
  rowTextDestructive: { color: theme.color.ember },
});
