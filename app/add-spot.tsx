//add-spot.tsx
import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, Image, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { decode } from 'base64-arraybuffer';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { KeyboardAwareScrollView } from '@codler/react-native-keyboard-aware-scroll-view';

const CORE_GENRES = ['Street', 'Landscape', 'Portrait', 'Astro', 'Wildlife', 'Architecture', 'Travel'];
const MORE_GENRES = ['Macro', 'Aerial', 'Long Exposure', 'Black & White', 'Night', 'Urban', 'Nature', 'Minimalist', 'Documentary', 'Abstract'];
const TIME_PERIODS = ['Morning', 'Afternoon', 'Evening', 'Night'];

export default function AddSpot() {
  const router = useRouter();
  const { session } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bestTime, setBestTime] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  const [image, setImage] = useState<{ uri: string; base64: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showMoreGenres, setShowMoreGenres] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);

  async function pickImage(source: 'camera' | 'library') {
    const permission = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert('Permission needed', `Allow ${source === 'camera' ? 'camera' : 'photo library'} access to add a photo.`);
      return;
    }

    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.6, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true, mediaTypes: ['images'] });

    if (!result.canceled && result.assets[0].base64) {
      setImage({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
    }
  }

  async function handleSubmit() {
    if (!title || !genre || !image) {
      Alert.alert('Almost there', 'Add a title, a genre, and a photo before saving.');
      return;
    }
    if (!session) return;

    setSaving(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location needed', 'Wanderlens needs your location to pin this spot.');
        setSaving(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = pos.coords;

      const fileName = `${session.user.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('spot-photos')
        .upload(fileName, decode(image.base64), { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('spot-photos').getPublicUrl(fileName);

      const { error: insertError } = await supabase.from('spots').insert({
        title,
        description: description || null,
        best_time: bestTime || null,
        genre,
        time_of_day: timeOfDay,
        photo_url: publicUrlData.publicUrl,
        location: `SRID=4326;POINT(${longitude} ${latitude})`,
        created_by: session.user.id,
      });
      if (insertError) throw insertError;

      Alert.alert('Spot added', 'Your spot is now live on the map.');
      router.back();
    } catch (err: any) {
      Alert.alert('Something went wrong', err.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAwareScrollView
      style={styles.root}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid
      extraScrollHeight={28}
    >
      <Text style={styles.heading}>Add a spot</Text>

      <Text style={styles.label}>Photo</Text>
      {image ? (
        <Image source={{ uri: image.uri }} style={styles.preview} />
      ) : (
        <View style={styles.photoButtons}>
          <Pressable style={styles.photoBtn} onPress={() => pickImage('camera')}><Text style={styles.photoBtnText}>Camera</Text></Pressable>
          <Pressable style={styles.photoBtn} onPress={() => pickImage('library')}><Text style={styles.photoBtnText}>Library</Text></Pressable>
        </View>
      )}
      {image && <Pressable onPress={() => setImage(null)}><Text style={styles.retake}>Choose a different photo</Text></Pressable>}

      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} placeholder="e.g. Marina Overlook" placeholderTextColor={theme.color.muted} value={title} onChangeText={setTitle} />

      <Text style={styles.label}>Genre</Text>
      <View style={styles.row}>
        {[...CORE_GENRES, ...(showMoreGenres ? MORE_GENRES : [])].map((g) => (
          <Pressable key={g} onPress={() => { setGenre(g); setCustomMode(false); }} style={[styles.chip, genre === g && styles.chipSelected]}>
            <Text style={[styles.chipText, genre === g && styles.chipTextSelected]}>{g}</Text>
          </Pressable>
        ))}
        {!showMoreGenres && (
          <Pressable onPress={() => setShowMoreGenres(true)} style={styles.chip}>
            <Text style={styles.chipText}>More +</Text>
          </Pressable>
        )}
        <Pressable onPress={() => { setCustomMode(true); setGenre(''); }} style={[styles.chip, customMode && styles.chipSelected]}>
          <Text style={[styles.chipText, customMode && styles.chipTextSelected]}>Custom</Text>
        </Pressable>
      </View>
      {customMode && (
        <TextInput
          style={[styles.input, { marginTop: 10 }]}
          placeholder="Type your own genre"
          placeholderTextColor={theme.color.muted}
          value={genre ?? ''}
          onChangeText={setGenre}
        />
      )}

      <Text style={styles.label}>Time of day</Text>
      <View style={styles.row}>
        {TIME_PERIODS.map((t) => (
          <Pressable key={t} onPress={() => setTimeOfDay(t)} style={[styles.chip, timeOfDay === t && styles.chipSelected]}>
            <Text style={[styles.chipText, timeOfDay === t && styles.chipTextSelected]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Best time to shoot</Text>
      <TextInput style={styles.input} placeholder="e.g. 6:10 AM · golden hour" placeholderTextColor={theme.color.muted} value={bestTime} onChangeText={setBestTime} />

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput style={[styles.input, styles.multiline]} placeholder="Any tips for other photographers?" placeholderTextColor={theme.color.muted} value={description} onChangeText={setDescription} multiline />

      <Text style={styles.locationNote}>Uses your current location as the spot's pin.</Text>

      <Pressable style={styles.submit} onPress={handleSubmit} disabled={saving}>
        {saving ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.submitText}>Save spot</Text>}
      </Pressable>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.dusk },
  container: { padding: 24, paddingBottom: 60 },
  heading: { fontFamily: theme.font.display, fontSize: 22, color: theme.color.cream, marginBottom: 20 },
  label: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, marginTop: 18, marginBottom: 8 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 12, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15, borderWidth: 1, borderColor: theme.color.surface2 },
  multiline: { height: 90, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.color.surface2 },
  chipSelected: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  chipText: { color: theme.color.cream, fontSize: 13, fontFamily: theme.font.bodyRegular },
  chipTextSelected: { color: theme.color.dusk, fontFamily: theme.font.body },
  photoButtons: { flexDirection: 'row', gap: 12 },
  photoBtn: { flex: 1, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.sm, paddingVertical: 24, alignItems: 'center' },
  photoBtnText: { color: theme.color.cream, fontFamily: theme.font.body },
  preview: { width: '100%', height: 200, borderRadius: theme.radius.sm },
  retake: { color: theme.color.gold, fontFamily: theme.font.bodyRegular, fontSize: 12, marginTop: 8, textAlign: 'center' },
  locationNote: { fontFamily: theme.font.mono, fontSize: 10.5, color: theme.color.muted, marginTop: 20, textAlign: 'center' },
  submit: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  submitText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
});