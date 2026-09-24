/**
 * ImageViewer, a full-screen photo lightbox with save-to-gallery buttons.
 *
 * Purpose: opens when a user taps a photo to see it large, on the Map and
 * Profile tabs, spot detail, public profiles, chat/group threads and the
 * chat message search overlay.
 *
 * How it works:
 * - A transparent, fading `<Modal>` over a near-black backdrop; tapping
 *   anywhere on the backdrop (including the photo) closes it.
 * - "Save photo" downloads the original image into the device gallery via
 *   `saveRemoteMediaToGallery` in lib/media.ts, then reports the result with
 *   an Alert (saved / permission needed / failed).
 * - An optional second button runs the caller's `onSaveStyled`, used to save
 *   a framed version (e.g. polaroid) that the caller renders itself.
 * - `saving` records which save is running, so that button shows a spinner and
 *   both save buttons are disabled until it finishes.
 */
import { useState } from 'react';
import { Modal, Pressable, Image, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { saveRemoteMediaToGallery } from '@/lib/media';

/** `uri` may be empty while the parent has no photo selected; the viewer then renders nothing. */
type Props = {
  visible: boolean;
  uri: string | null | undefined;
  onClose: () => void;
  /** Optional second save action for a styled/framed version (e.g. "Save as polaroid") — omit for plain image viewing. */
  onSaveStyled?: () => Promise<unknown> | void;
  styledLabel?: string;
};

/** Full-screen viewer; `styledLabel` is a small hint shown under the styled-save button. */
export function ImageViewer({ visible, uri, onClose, onSaveStyled, styledLabel }: Props) {
  // Which save is in flight, or null when idle.
  const [saving, setSaving] = useState<'raw' | 'styled' | null>(null);
  // Early return comes after the hook so hooks run in the same order every render.
  if (!uri) return null;

  /**
   * Saves the original photo to the gallery and tells the user how it went.
   * `saveRemoteMediaToGallery` returns false when photo permission is denied
   * and throws on other failures.
   */
  async function handleSaveRaw() {
    // Ignore taps while any save is already running.
    if (!uri || saving) return;
    setSaving('raw');
    try {
      const ok = await saveRemoteMediaToGallery(uri);
      if (ok) Alert.alert('Saved', 'Photo saved to your gallery.');
      else Alert.alert('Permission needed', 'Allow photo access to save images.');
    } catch {
      Alert.alert('Could not save', 'Something went wrong saving this photo.');
    } finally {
      setSaving(null);
    }
  }

  /**
   * Runs the caller's styled-save. The caller is responsible for its own
   * success/error feedback; this only manages the spinner.
   */
  async function handleSaveStyled() {
    if (!onSaveStyled || saving) return;
    setSaving('styled');
    try {
      await onSaveStyled();
    } finally {
      setSaving(null);
    }
  }

  // Note: the Modal has no onRequestClose, so the Android back button does
  // not close it; the close button or a backdrop tap does.
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* The photo, letterboxed to fit ("contain") within 80% of the height */}
        <Image source={{ uri }} style={styles.image} resizeMode="contain" />

        {/* Top-right button row, positioned absolutely from right to left:
            close (24), save (78), styled save (132, only if provided) */}
        {onSaveStyled && (
          <Pressable onPress={handleSaveStyled} disabled={!!saving} accessibilityLabel="Save styled photo" style={[styles.save, { right: 132 }]}>
            {saving === 'styled' ? <ActivityIndicator size="small" color={theme.color.gold} /> : <Ionicons name="images-outline" size={18} color={theme.color.gold} />}
          </Pressable>
        )}
        <Pressable onPress={handleSaveRaw} disabled={!!saving} accessibilityLabel="Save photo" style={[styles.save, { right: 78 }]}>
          {saving === 'raw' ? <ActivityIndicator size="small" color={theme.color.gold} /> : <Ionicons name="download-outline" size={18} color={theme.color.gold} />}
        </Pressable>
        <Pressable onPress={onClose} accessibilityLabel="Close" style={styles.close}><Ionicons name="close" size={20} color="#fff" /></Pressable>

        {onSaveStyled && !!styledLabel && (
          <Text style={styles.hint}>{styledLabel}</Text>
        )}
      </Pressable>
    </Modal>
  );
}

// The near-black backdrop and translucent-white buttons are rgba literals
// rather than constants/theme.ts tokens; the gold icon color does come
// from the theme.
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '80%' },
  save: { position: 'absolute', top: 50, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', top: 50, right: 24, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  hint: { position: 'absolute', top: 98, right: 24, color: 'rgba(255,255,255,0.5)', fontSize: 9 },
});
