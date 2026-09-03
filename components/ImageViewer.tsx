import { useState } from 'react';
import { Modal, Pressable, Image, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { saveRemoteImageToGallery } from '@/lib/media';

export function ImageViewer({ visible, uri, onClose }: { visible: boolean; uri: string | null | undefined; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  if (!uri) return null;

  async function handleSave() {
    if (!uri || saving) return;
    setSaving(true);
    try {
      const ok = await saveRemoteImageToGallery(uri);
      if (ok) Alert.alert('Saved', 'Photo saved to your gallery.');
      else Alert.alert('Permission needed', 'Allow photo access to save images.');
    } catch {
      Alert.alert('Could not save', 'Something went wrong saving this photo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Image source={{ uri }} style={styles.image} resizeMode="contain" />
        <Pressable onPress={handleSave} disabled={saving} style={[styles.save, { right: 68 }]}>
          {saving ? <ActivityIndicator size="small" color={theme.color.gold} /> : <Ionicons name="download-outline" size={18} color={theme.color.gold} />}
        </Pressable>
        <Pressable onPress={onClose} style={styles.close}><Text style={styles.closeText}>✕</Text></Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '80%' },
  save: { position: 'absolute', top: 50, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', top: 50, right: 24, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 13 },
});
