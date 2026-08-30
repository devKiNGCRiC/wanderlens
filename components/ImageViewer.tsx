import { Modal, Pressable, Image, Text, StyleSheet } from 'react-native';

export function ImageViewer({ visible, uri, onClose }: { visible: boolean; uri: string | null | undefined; onClose: () => void }) {
  if (!uri) return null;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Image source={{ uri }} style={styles.image} resizeMode="contain" />
        <Pressable onPress={onClose} style={styles.close}><Text style={styles.closeText}>✕</Text></Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '80%' },
  close: { position: 'absolute', top: 50, right: 24, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 13 },
});