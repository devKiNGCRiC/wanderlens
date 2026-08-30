import { Modal, Pressable, View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { TAG_INFO } from '@/constants/tagInfo';

export function TagInfoModal({ tag, onClose }: { tag: string | null; onClose: () => void }) {
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

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  card: { backgroundColor: theme.color.surface, borderRadius: theme.radius.md, padding: 20, width: '100%', borderWidth: 1, borderColor: theme.color.surface2 },
  tagName: { fontFamily: theme.font.display, fontSize: 18, color: theme.color.gold },
  description: { fontFamily: theme.font.bodyRegular, fontSize: 14, color: theme.color.cream, marginTop: 10, lineHeight: 20 },
  closeBtn: { marginTop: 18, alignSelf: 'flex-end' },
  closeText: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted },
});