import { useState } from 'react';
import { Modal, Pressable, Image, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { saveRemoteImageToGallery } from '@/lib/media';

type Props = {
  visible: boolean;
  uri: string | null | undefined;
  onClose: () => void;
  /** Optional second save action for a styled/framed version (e.g. "Save as polaroid") — omit for plain image viewing. */
  onSaveStyled?: () => Promise<unknown> | void;
  styledLabel?: string;
};

export function ImageViewer({ visible, uri, onClose, onSaveStyled, styledLabel }: Props) {
  const [saving, setSaving] = useState<'raw' | 'styled' | null>(null);
  if (!uri) return null;

  async function handleSaveRaw() {
    if (!uri || saving) return;
    setSaving('raw');
    try {
      const ok = await saveRemoteImageToGallery(uri);
      if (ok) Alert.alert('Saved', 'Photo saved to your gallery.');
      else Alert.alert('Permission needed', 'Allow photo access to save images.');
    } catch {
      Alert.alert('Could not save', 'Something went wrong saving this photo.');
    } finally {
      setSaving(null);
    }
  }

  async function handleSaveStyled() {
    if (!onSaveStyled || saving) return;
    setSaving('styled');
    try {
      await onSaveStyled();
    } finally {
      setSaving(null);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Image source={{ uri }} style={styles.image} resizeMode="contain" />

        {onSaveStyled && (
          <Pressable onPress={handleSaveStyled} disabled={!!saving} style={[styles.save, { right: 112 }]}>
            {saving === 'styled' ? <ActivityIndicator size="small" color={theme.color.gold} /> : <Ionicons name="images-outline" size={18} color={theme.color.gold} />}
          </Pressable>
        )}
        <Pressable onPress={handleSaveRaw} disabled={!!saving} style={[styles.save, { right: 68 }]}>
          {saving === 'raw' ? <ActivityIndicator size="small" color={theme.color.gold} /> : <Ionicons name="download-outline" size={18} color={theme.color.gold} />}
        </Pressable>
        <Pressable onPress={onClose} style={styles.close}><Text style={styles.closeText}>✕</Text></Pressable>

        {onSaveStyled && !!styledLabel && (
          <Text style={styles.hint}>{styledLabel}</Text>
        )}
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
  hint: { position: 'absolute', top: 88, right: 24, color: 'rgba(255,255,255,0.5)', fontSize: 9 },
});
