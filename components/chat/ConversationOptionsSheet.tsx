import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

export type ConversationAction =
  | 'pin' | 'unpin' | 'mute' | 'unmute' | 'favorite' | 'unfavorite'
  | 'archive' | 'unarchive' | 'markUnread' | 'clear' | 'delete';

type Option = { action: ConversationAction; label: string; icon: keyof typeof Ionicons.glyphMap; destructive?: boolean };

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (action: ConversationAction) => void;
  isPinned: boolean;
  isMuted: boolean;
  isFavorite: boolean;
  isArchived: boolean;
};

export function ConversationOptionsSheet({ visible, onClose, onSelect, isPinned, isMuted, isFavorite, isArchived }: Props) {
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
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
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

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: theme.color.surface, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 34 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: theme.color.surface2, alignSelf: 'center', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  rowText: { fontFamily: theme.font.bodyRegular, fontSize: 14.5, color: theme.color.cream },
  rowTextDestructive: { color: theme.color.ember },
});
