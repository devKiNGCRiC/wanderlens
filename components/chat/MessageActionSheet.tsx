import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

const QUICK_EMOJI = ['❤️', '😂', '👍', '😮', '😢', '🙏'];

type Props = {
  visible: boolean;
  onClose: () => void;
  onReply: () => void;
  onReact: (emoji: string) => void;
};

export function MessageActionSheet({ visible, onClose, onReply, onReact }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.emojiRow}>
            {QUICK_EMOJI.map((emoji) => (
              <Pressable key={emoji} onPress={() => { onReact(emoji); onClose(); }} style={styles.emojiBtn}>
                <Text style={styles.emoji}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.row} onPress={() => { onReply(); onClose(); }}>
            <Ionicons name="arrow-undo-outline" size={18} color={theme.color.cream} />
            <Text style={styles.rowText}>Reply</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 30 },
  sheet: { backgroundColor: theme.color.surface, borderRadius: theme.radius.lg, padding: 16, width: '100%', maxWidth: 320, borderWidth: 1, borderColor: theme.color.surface2 },
  emojiRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  emojiBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.surface2 },
  emoji: { fontSize: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.color.surface2 },
  rowText: { fontFamily: theme.font.bodyRegular, fontSize: 14, color: theme.color.cream },
});
