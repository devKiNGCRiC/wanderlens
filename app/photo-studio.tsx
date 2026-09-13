import { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { ScreenBackground } from '@/components/ScreenBackground';
import { PhotoStyleFrame, type PhotoStyleKey } from '@/components/PhotoStyleFrame';
import { PhotoStylePicker } from '@/components/PhotoStylePicker';
import { saveViewAsImage } from '@/lib/media';

export default function PhotoStudio() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const previewRef = useRef<View>(null);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [styleKey, setStyleKey] = useState<PhotoStyleKey>('polaroid');
  const [downloading, setDownloading] = useState(false);

  // The frame adds its own margin around the photo (widest for polaroid), so
  // size the photo itself down from the screen width to keep the full frame
  // on-screen with room on both sides.
  const previewSize = Math.min(width - 96, 340);

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

  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.topBarTitle}>Photo Styles</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.container}>
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
            <View style={styles.previewWrap}>
              <PhotoStyleFrame photoUri={photoUri} style={styleKey} size={previewSize} innerRef={previewRef} />
            </View>
            <Pressable onPress={() => setPhotoUri(null)}>
              <Text style={styles.retake}>Choose a different photo</Text>
            </Pressable>

            <Text style={styles.label}>Style</Text>
            <PhotoStylePicker value={styleKey} onChange={setStyleKey} />

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
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  container: { flex: 1, padding: 24, alignItems: 'center' },
  photoButtons: { flexDirection: 'row', gap: 12, width: '100%', marginTop: 40 },
  photoBtn: { flex: 1, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.sm, paddingVertical: 28, alignItems: 'center', gap: 8 },
  photoBtnText: { color: theme.color.cream, fontFamily: theme.font.body },
  previewWrap: { marginTop: 24, alignItems: 'center' },
  retake: { color: theme.color.gold, fontFamily: theme.font.bodyRegular, fontSize: 12, marginTop: 14, textAlign: 'center' },
  label: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, marginTop: 28, marginBottom: 10, alignSelf: 'flex-start' },
  downloadBtn: { flexDirection: 'row', gap: 8, backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  downloadBtnText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
});
