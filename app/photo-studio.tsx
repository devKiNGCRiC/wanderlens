/**
 * Route: /photo-studio, "Photo Styles" modal.
 *
 * Purpose: a standalone tool for dressing up any photo in one of the app's
 * frame styles (polaroid, vintage, golden hour, etc.), with an optional
 * caption, and saving the result to the device gallery. Nothing is uploaded
 * or posted. Opened from the Feed tab and from the Profile menu's "Photo
 * styles" item; registered as a modal inside the fully-onboarded
 * `<Stack.Protected>` guard in app/_layout.tsx.
 *
 * How it works:
 * - The photo comes from expo-image-picker (camera or library).
 * - PhotoStyleFrame renders the styled preview; PhotoStylePicker and
 *   CaptionFontPicker are the controls (the same components add-spot uses).
 * - "Download" captures the preview View with react-native-view-shot (via
 *   saveViewAsImage in lib/media.ts) and writes it to the gallery.
 * - All state is local; there is no Supabase access on this screen.
 *
 * Gotcha: the saved image is a capture of the on-screen preview, so its
 * resolution follows `previewSize`, not the original photo's resolution.
 */
import { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '@codler/react-native-keyboard-aware-scroll-view';
import { theme } from '@/constants/theme';
import { ScreenBackground } from '@/components/ScreenBackground';
import { PhotoStyleFrame, type PhotoStyleKey, type CaptionFontKey } from '@/components/PhotoStyleFrame';
import { PhotoStylePicker } from '@/components/PhotoStylePicker';
import { CaptionFontPicker } from '@/components/CaptionFontPicker';
import { saveViewAsImage } from '@/lib/media';

/**
 * The Photo Styles screen: pick a photo, choose a frame style, caption and
 * font, then download the composited image.
 */
export default function PhotoStudio() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Points at the rendered PhotoStyleFrame; this is the View that gets captured on download.
  const previewRef = useRef<View>(null);

  // Chosen photo, frame style (defaults to polaroid), caption text and font,
  // and the download spinner flag.
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [styleKey, setStyleKey] = useState<PhotoStyleKey>('polaroid');
  const [caption, setCaption] = useState('');
  const [captionFont, setCaptionFont] = useState<CaptionFontKey>('displayItalic');
  const [downloading, setDownloading] = useState(false);

  // The frame adds its own margin around the photo (widest for polaroid), so
  // size the photo itself down from the screen width to keep the full frame
  // on-screen with room on both sides.
  const previewSize = Math.min(width - 96, 340);

  /**
   * Gets a photo from the system camera or photo library, asking for the
   * matching permission first. Only the local uri is kept (no base64),
   * because this screen never uploads.
   */
  async function pickImage(source: 'camera' | 'library') {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', `Allow ${source === 'camera' ? 'camera' : 'photo library'} access to pick a photo.`);
      return;
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ['images'] });
    if (!result.canceled) setPhotoUri(result.assets[0].uri);
  }

  /**
   * Captures the styled preview and saves it to the gallery. saveViewAsImage
   * returns false when gallery permission is denied, which shows a
   * "Permission needed" alert instead of "Saved".
   */
  async function handleDownload() {
    setDownloading(true);
    try {
      const ok = await saveViewAsImage(previewRef);
      Alert.alert(ok ? 'Saved' : 'Permission needed', ok ? 'Saved to your gallery.' : 'Allow photo access to save images.');
    } catch {
      Alert.alert('Could not save', 'Something went wrong saving this photo.');
    } finally {
      setDownloading(false);
    }
  }

  // Layout: custom top bar, then either the photo-source buttons or the
  // preview plus style controls and the Download button.
  return (
    <ScreenBackground>
      {/* Hide the native modal header; this screen draws its own top bar. */}
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.topBarTitle}>Photo Styles</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* KeyboardAwareScrollView keeps the caption input visible above the keyboard. */}
      <KeyboardAwareScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" enableOnAndroid extraScrollHeight={28}>
        {/* No photo yet: Camera / Library buttons. Otherwise: preview and controls. */}
        {!photoUri ? (
          <View style={styles.photoButtons}>
            <Pressable style={styles.photoBtn} onPress={() => pickImage('camera')}>
              <Ionicons name="camera-outline" size={22} color={theme.color.cream} />
              <Text style={styles.photoBtnText}>Camera</Text>
            </Pressable>
            <Pressable style={styles.photoBtn} onPress={() => pickImage('library')}>
              <Ionicons name="images-outline" size={22} color={theme.color.cream} />
              <Text style={styles.photoBtnText}>Library</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Styled preview; the caption is dropped when the style is 'none'. */}
            <View style={styles.previewWrap}>
              <PhotoStyleFrame photoUri={photoUri} style={styleKey} caption={styleKey !== 'none' ? caption : null} captionFont={captionFont} size={previewSize} innerRef={previewRef} />
            </View>
            <Pressable onPress={() => setPhotoUri(null)}>
              <Text style={styles.retake}>Choose a different photo</Text>
            </Pressable>

            <Text style={styles.label}>Style</Text>
            <PhotoStylePicker value={styleKey} onChange={setStyleKey} />

            {/* Caption and font controls only apply to framed styles. */}
            {styleKey !== 'none' && (
              <>
                <Text style={styles.label}>Caption</Text>
                <TextInput
                  style={styles.captionInput}
                  placeholder="Add a caption (optional)"
                  placeholderTextColor={theme.color.muted}
                  value={caption}
                  onChangeText={setCaption}
                  maxLength={80}
                />

                <Text style={styles.label}>Caption font</Text>
                <CaptionFontPicker value={captionFont} onChange={setCaptionFont} />
              </>
            )}

            {/* Download: spinner while saving, otherwise icon + label. */}
            <Pressable style={styles.downloadBtn} onPress={handleDownload} disabled={downloading}>
              {downloading ? <ActivityIndicator color={theme.color.dusk} /> : (
                <>
                  <Ionicons name="download-outline" size={18} color={theme.color.dusk} />
                  <Text style={styles.downloadBtnText}>Download</Text>
                </>
              )}
            </Pressable>
          </>
        )}
      </KeyboardAwareScrollView>
    </ScreenBackground>
  );
}

// Styles use design tokens (colors, fonts, radii) from constants/theme.ts.
const styles = StyleSheet.create({
  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  // Content and photo-source buttons
  container: { flexGrow: 1, padding: 24, alignItems: 'center', paddingBottom: 60 },
  photoButtons: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 40 },
  photoBtn: { flex: 1, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.sm, paddingVertical: 28, alignItems: 'center', gap: 8 },
  photoBtnText: { color: theme.color.cream, fontFamily: theme.font.body },
  // Preview and style controls
  previewWrap: { marginTop: 24, alignItems: 'center' },
  retake: { color: theme.color.gold, fontFamily: theme.font.bodyRegular, fontSize: 12, marginTop: 14, textAlign: 'center' },
  label: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, marginTop: 28, marginBottom: 10, alignSelf: 'flex-start' },
  captionInput: { width: '100%', backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 12, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15, borderWidth: 1, borderColor: theme.color.surface2 },
  // Download button
  downloadBtn: { flexDirection: 'row', gap: 8, backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  downloadBtnText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
});
