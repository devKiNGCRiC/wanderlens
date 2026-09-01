import { useState } from 'react';
import { View, Text, TextInput, Pressable, Image, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { decode } from 'base64-arraybuffer';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { generateCaption } from '@/lib/ai';
import { ScreenBackground } from '@/components/ScreenBackground';
import { useLocationPickerStore } from '@/store/locationPicker';
import { KeyboardAwareScrollView } from '@codler/react-native-keyboard-aware-scroll-view';

const CORE_GENRES = ['Street', 'Landscape', 'Portrait', 'Astro', 'Wildlife', 'Architecture', 'Travel'];
const MORE_GENRES = ['Macro', 'Aerial', 'Long Exposure', 'Black & White', 'Night', 'Urban', 'Nature', 'Minimalist', 'Documentary', 'Abstract'];
const TIME_PERIODS = ['Morning', 'Afternoon', 'Evening', 'Night'];

type ResolvedLocation = { lat: number; lng: number; label: string };

export default function AddSpot() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const picked = useLocationPickerStore((s) => s.picked);
  const setPicked = useLocationPickerStore((s) => s.setPicked);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bestTime, setBestTime] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  const [image, setImage] = useState<{ uri: string; base64: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [showMoreGenres, setShowMoreGenres] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [generatingCaption, setGeneratingCaption] = useState(false);

  const [locationMode, setLocationMode] = useState<'here' | 'remote'>('here');
  const [placeQuery, setPlaceQuery] = useState('');
  const [resolvedLocation, setResolvedLocation] = useState<ResolvedLocation | null>(null);
  const [resolvingLocation, setResolvingLocation] = useState(false);

  useFocusEffect(
    useCallbackSafe(() => {
      if (picked) {
        setResolvedLocation(picked);
        setPicked(null);
      }
    }, [picked])
  );

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

  function labelFromPlace(place: Location.LocationGeocodedAddress | undefined, fallback: string) {
    return [place?.city || place?.subregion, place?.region, place?.country].filter(Boolean).join(', ') || fallback;
  }

  async function detectCurrentLocation() {
    setResolvingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location needed', 'Enable location access to detect where you are.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
      setResolvedLocation({ lat: latitude, lng: longitude, label: labelFromPlace(place, 'Location detected') });
    } catch (err: any) {
      Alert.alert('Could not detect location', err.message ?? 'Please try again.');
    } finally {
      setResolvingLocation(false);
    }
  }

  async function searchPlace() {
    if (!placeQuery.trim()) return;
    setResolvingLocation(true);
    try {
      const results = await Location.geocodeAsync(placeQuery.trim());
      if (results.length === 0) {
        Alert.alert('Not found', 'No matching location found — try a more specific search.');
        return;
      }
      const { latitude, longitude } = results[0];
      const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
      setResolvedLocation({ lat: latitude, lng: longitude, label: labelFromPlace(place, placeQuery.trim()) });
    } catch (err: any) {
      Alert.alert('Could not find that place', err.message ?? 'Please try again.');
    } finally {
      setResolvingLocation(false);
    }
  }

  function switchMode(mode: 'here' | 'remote') {
    setLocationMode(mode);
    setResolvedLocation(null);
    setPlaceQuery('');
  }

  function openLocationPicker() {
    const base = resolvedLocation;
    router.push({
      pathname: '/pick-location',
      params: base ? { lat: String(base.lat), lng: String(base.lng) } : {},
    });
  }

  async function handleSuggestCaption() {
    if (!image) return;
    setGeneratingCaption(true);
    try {
      const result = await generateCaption(image.base64);
      setTitle(result.title);
      setDescription(result.description);
    } catch (err: any) {
      Alert.alert('Could not generate a suggestion', err.message ?? 'Try again, or write your own.');
    } finally {
      setGeneratingCaption(false);
    }
  }

  async function handleSubmit() {
    if (!title || !genre || !image) {
      Alert.alert('Almost there', 'Add a title, a genre, and a photo before saving.');
      return;
    }
    if (!resolvedLocation) {
      Alert.alert('Location needed', locationMode === 'here' ? 'Tap "Detect my location" first.' : 'Search and confirm a place first.');
      return;
    }
    if (!session) return;

    setSaving(true);
    try {
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
        location: `SRID=4326;POINT(${resolvedLocation.lng} ${resolvedLocation.lat})`,
        location_label: resolvedLocation.label,
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
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.topBarTitle}>Add a spot</Text>
        <View style={{ width: 36 }} />
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" enableOnAndroid extraScrollHeight={28}>
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
        {image && (
          <Pressable onPress={handleSuggestCaption} style={styles.aiSuggestBtn} disabled={generatingCaption}>
            {generatingCaption ? <ActivityIndicator color={theme.color.gold} size="small" /> : <Text style={styles.aiSuggestText}>✨ Suggest title & description</Text>}
          </Pressable>
        )}

        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} placeholder="e.g. Marina Overlook" placeholderTextColor={theme.color.muted} value={title} onChangeText={setTitle} />

        <Text style={styles.label}>Location</Text>
        <View style={styles.modeRow}>
          <Pressable onPress={() => switchMode('here')} style={[styles.modeChip, locationMode === 'here' && styles.chipSelected]}>
            <Text style={[styles.chipText, locationMode === 'here' && styles.chipTextSelected]}>I'm here now</Text>
          </Pressable>
          <Pressable onPress={() => switchMode('remote')} style={[styles.modeChip, locationMode === 'remote' && styles.chipSelected]}>
            <Text style={[styles.chipText, locationMode === 'remote' && styles.chipTextSelected]}>From another trip</Text>
          </Pressable>
        </View>

        {locationMode === 'here' ? (
          <Pressable onPress={detectCurrentLocation} style={styles.locationActionBtn} disabled={resolvingLocation}>
            {resolvingLocation ? <ActivityIndicator color={theme.color.gold} size="small" /> : <Text style={styles.locationActionText}>📍 Detect my location</Text>}
          </Pressable>
        ) : (
          <View style={styles.searchRow}>
            <TextInput style={[styles.input, { flex: 1 }]} placeholder="Search a place, e.g. Kedarnath" placeholderTextColor={theme.color.muted} value={placeQuery} onChangeText={setPlaceQuery} onSubmitEditing={searchPlace} />
            <Pressable onPress={searchPlace} style={styles.searchBtn} disabled={resolvingLocation}>
              {resolvingLocation ? <ActivityIndicator color={theme.color.dusk} size="small" /> : <Text style={styles.searchBtnText}>Find</Text>}
            </Pressable>
          </View>
        )}

        {resolvedLocation && (
          <View style={styles.resolvedBox}>
            <Ionicons name="checkmark-circle" size={15} color={theme.color.gold} />
            <Text style={styles.resolvedText}>{resolvedLocation.label}</Text>
          </View>
        )}
        {resolvedLocation && (
          <Pressable onPress={openLocationPicker} style={styles.fineTuneBtn}>
            <Ionicons name="map-outline" size={14} color={theme.color.gold} />
            <Text style={styles.fineTuneText}>Fine-tune exact spot on map</Text>
          </Pressable>
        )}
        {!resolvedLocation && locationMode === 'remote' && (
          <Pressable onPress={openLocationPicker} style={styles.fineTuneBtn}>
            <Ionicons name="map-outline" size={14} color={theme.color.gold} />
            <Text style={styles.fineTuneText}>Or pick location directly on map</Text>
          </Pressable>
        )}

        <Text style={styles.label}>Genre</Text>
        <View style={styles.row}>
          {[...CORE_GENRES, ...(showMoreGenres ? MORE_GENRES : [])].map((g) => (
            <Pressable key={g} onPress={() => { setGenre(g); setCustomMode(false); }} style={[styles.chip, genre === g && styles.chipSelected]}>
              <Text style={[styles.chipText, genre === g && styles.chipTextSelected]}>{g}</Text>
            </Pressable>
          ))}
          {!showMoreGenres && <Pressable onPress={() => setShowMoreGenres(true)} style={styles.chip}><Text style={styles.chipText}>More +</Text></Pressable>}
          <Pressable onPress={() => { setCustomMode(true); setGenre(''); }} style={[styles.chip, customMode && styles.chipSelected]}>
            <Text style={[styles.chipText, customMode && styles.chipTextSelected]}>Custom</Text>
          </Pressable>
        </View>
        {customMode && (
          <TextInput style={[styles.input, { marginTop: 10 }]} placeholder="Type your own genre" placeholderTextColor={theme.color.muted} value={genre ?? ''} onChangeText={setGenre} />
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

        <Pressable style={styles.submit} onPress={handleSubmit} disabled={saving}>
          {saving ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.submitText}>Save spot</Text>}
        </Pressable>
      </KeyboardAwareScrollView>
    </ScreenBackground>
  );
}

// Plain re-export so the file only needs one import line for useCallback
function useCallbackSafe<T extends (...args: any[]) => any>(fn: T, deps: any[]) {
  const React = require('react');
  return React.useCallback(fn, deps);
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  container: { padding: 24, paddingBottom: 60, paddingTop: 4 },
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
  aiSuggestBtn: { marginTop: 10, borderWidth: 1, borderColor: theme.color.gold, borderRadius: 20, paddingVertical: 9, alignItems: 'center' },
  aiSuggestText: { fontFamily: theme.font.body, fontSize: 12.5, color: theme.color.gold },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeChip: { flex: 1, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: theme.color.surface2, alignItems: 'center' },
  locationActionBtn: { marginTop: 10, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.sm, paddingVertical: 13, alignItems: 'center' },
  locationActionText: { fontFamily: theme.font.body, fontSize: 13.5, color: theme.color.cream },
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  searchBtn: { backgroundColor: theme.color.gold, borderRadius: theme.radius.sm, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  searchBtnText: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.dusk },
  resolvedBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  resolvedText: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.gold },
  fineTuneBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  fineTuneText: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.gold, textDecorationLine: 'underline' },
  submit: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
  submitText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
});