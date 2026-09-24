/**
 * VideoViewerModal, full-screen player for a video message in a chat.
 *
 * Purpose: tapping a video "film reel" bubble in app/chat/[id].tsx sets the
 * screen's videoViewerUri, which opens this modal. It plays the clip with
 * native controls and offers a button to save it to the phone's gallery.
 *
 * How it works:
 * - expo-video: useVideoPlayer() creates a native player for the URI and
 *   <VideoView> renders it. The setup callback turns looping off and starts
 *   playback when the modal is visible.
 * - The URI is either a signed Supabase Storage URL (sent/received video)
 *   or a local file URI (a message still uploading).
 * - Saving goes through saveRemoteMediaToGallery() in lib/media.ts, which
 *   asks for media-library permission, downloads remote files to the cache,
 *   then writes them to the gallery. It returns false when permission is denied.
 *
 * Gotchas:
 * - The hooks run before the `if (!uri) return null` early return on
 *   purpose: React requires hooks to be called in the same order on every
 *   render, so no hook may sit after a conditional return.
 */
import { useState } from 'react';
import { Modal, View, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { saveRemoteMediaToGallery } from '@/lib/media';

/**
 * visible: whether the modal is shown (the screen passes !!uri).
 * uri: video to play; null renders nothing.
 * onClose: clears the parent's videoViewerUri.
 */
type Props = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
};

/** Full-screen video player with Save and Close buttons. */
export function VideoViewerModal({ visible, uri, onClose }: Props) {
  // True while a gallery save is in flight; swaps the save icon for a spinner
  // and blocks repeat taps.
  const [saving, setSaving] = useState(false);
  // Native video player. An empty string is passed when there is no URI yet
  // because the hook must still be called on every render.
  const player = useVideoPlayer(uri ?? '', (p) => {
    p.loop = false;
    if (visible) p.play();
  });

  // Nothing to show until the parent supplies a video.
  if (!uri) return null;

  /**
   * Downloads the video (if remote) and saves it to the device gallery as .mp4,
   * then reports the outcome with a native Alert.
   */
  async function handleSave() {
    // Ignore taps while a save is already running.
    if (!uri || saving) return;
    setSaving(true);
    try {
      // ok is false when the user declined photo-library permission.
      const ok = await saveRemoteMediaToGallery(uri, 'mp4');
      if (ok) Alert.alert('Saved', 'Video saved to your gallery.');
      else Alert.alert('Permission needed', 'Allow photo access to save videos.');
    } catch {
      // Download or gallery write failed; show a friendly message, not the raw error.
      Alert.alert('Could not save', 'Something went wrong saving this video.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        {/* The video itself, letterboxed ("contain") with the platform's own controls */}
        <VideoView player={player} style={styles.video} contentFit="contain" allowsFullscreen nativeControls />
        {/* Top-right icon buttons: Save (left of Close), then Close */}
        <Pressable onPress={handleSave} disabled={saving} accessibilityLabel="Save video" style={[styles.iconBtn, { right: 78 }]}>
          {saving ? <ActivityIndicator size="small" color={theme.color.gold} /> : <Ionicons name="download-outline" size={18} color={theme.color.gold} />}
        </Pressable>
        <Pressable onPress={onClose} accessibilityLabel="Close" style={[styles.iconBtn, { right: 24 }]}>
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

// Styles use design tokens from constants/theme.ts where colours are themed;
// the near-black backdrop and translucent button fill are literal rgba values.
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' },
  video: { width: '100%', height: '70%' },
  iconBtn: { position: 'absolute', top: 50, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
});
