import { useState } from 'react';
import { Modal, View, Pressable, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { saveRemoteMediaToGallery } from '@/lib/media';

type Props = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
};

export function VideoViewerModal({ visible, uri, onClose }: Props) {
  const [saving, setSaving] = useState(false);
  const player = useVideoPlayer(uri ?? '', (p) => {
    p.loop = false;
    if (visible) p.play();
  });

  if (!uri) return null;

  async function handleSave() {
    if (!uri || saving) return;
    setSaving(true);
    try {
      const ok = await saveRemoteMediaToGallery(uri, 'mp4');
      if (ok) Alert.alert('Saved', 'Video saved to your gallery.');
      else Alert.alert('Permission needed', 'Allow photo access to save videos.');
    } catch {
      Alert.alert('Could not save', 'Something went wrong saving this video.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <VideoView player={player} style={styles.video} contentFit="contain" allowsFullscreen nativeControls />
        <Pressable onPress={handleSave} disabled={saving} style={[styles.iconBtn, { right: 68 }]}>
          {saving ? <ActivityIndicator size="small" color={theme.color.gold} /> : <Ionicons name="download-outline" size={18} color={theme.color.gold} />}
        </Pressable>
        <Pressable onPress={onClose} style={[styles.iconBtn, { right: 24 }]}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  video: { width: '100%', height: '70%' },
  iconBtn: { position: 'absolute', top: 50, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 13 },
});
