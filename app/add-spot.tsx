/**
 * Route: /add-spot, "Add a spot" modal.
 *
 * Purpose: the form a user fills in to publish a new photo spot to the
 * community map, the first pillar of Wanderlens (a crowdsourced, geo-tagged
 * photo-spot map). Opened from the Map tab's "+" FAB, and also reached from
 * /spot-camera when that camera was launched on its own from the Feed FAB.
 * Registered as a modal inside the fully-onboarded `<Stack.Protected>` guard
 * in app/_layout.tsx, so only signed-in, onboarded users can reach it.
 *
 * How it works:
 * - Photo: either the in-app geo-tag camera (/spot-camera) or the system
 *   photo library (expo-image-picker). The camera hands its result back
 *   through the `useSpotCameraStore` Zustand store, including GPS, altitude,
 *   place name and weather captured at shutter time.
 * - Location, three ways: "I'm here now" (device GPS + reverse geocode),
 *   "From another trip" (text search via expo-location's geocoder), or
 *   tap-to-pin on /pick-location, which returns its choice through the
 *   `useLocationPickerStore` Zustand store.
 * - Optional photo style: a PhotoStyleFrame preview (polaroid, vintage, etc.)
 *   is rendered on screen and, on save, captured to a second JPEG.
 * - Optional AI caption: `generateCaption` (lib/ai.ts) calls a Supabase Edge
 *   Function that suggests a title and description from the photo.
 * - Save: uploads the photo (and the styled copy, if any) to the
 *   `spot-photos` storage bucket under the user's id folder, then inserts
 *   one row into the `spots` table with a PostGIS point for its location.
 *
 * Why Zustand for the camera and map-picker results: expo-router screens
 * can't return a value to the screen that opened them, so the modal writes
 * to a tiny store and this screen reads it when it regains focus (see
 * .claude/rules/architecture.md, "Ephemeral cross-screen handoff").
 *
 * Gotchas:
 * - The styled copy is captured from the on-screen preview View, so it is
 *   only as large as that preview (at most 280px square here).
 * - Switching location mode clears any already-resolved location.
 */
import { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Image, StyleSheet, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
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
import { PhotoStyleFrame, type PhotoStyleKey, type CaptionFontKey } from '@/components/PhotoStyleFrame';
import { PhotoStylePicker } from '@/components/PhotoStylePicker';
import { CaptionFontPicker } from '@/components/CaptionFontPicker';
import { captureViewAsBase64 } from '@/lib/media';
import { useLocationPickerStore } from '@/store/locationPicker';
import { useSpotCameraStore, type CapturedPhoto } from '@/store/spotCamera';
import { KeyboardAwareScrollView } from '@codler/react-native-keyboard-aware-scroll-view';

// Genre chips. The core list shows by default; "More +" reveals the rest,
// and "Custom" lets the user type any genre as free text.
const CORE_GENRES = ['Street', 'Landscape', 'Portrait', 'Astro', 'Wildlife', 'Architecture', 'Travel'];
const MORE_GENRES = ['Macro', 'Aerial', 'Long Exposure', 'Black & White', 'Night', 'Urban', 'Nature', 'Minimalist', 'Documentary', 'Abstract'];
// Values for the spot's `time_of_day` column, shown as single-select chips.
const TIME_PERIODS = ['Morning', 'Afternoon', 'Evening', 'Night'];

/** A confirmed spot location: coordinates plus a human-readable label ("City, Region, Country"). */
type ResolvedLocation = { lat: number; lng: number; label: string };

/**
 * The Add-a-spot screen. Owns all form state locally, picks up results from
 * the camera and map-picker modals on focus, and writes the new spot to
 * Supabase on submit, then closes itself with router.back().
 */
export default function AddSpot() {
  const router = useRouter();
  // Safe-area insets keep the custom top bar clear of the status bar / notch.
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  // Zustand handoff slots: /pick-location writes `picked`, /spot-camera
  // writes `captured`. This screen reads each one and then clears it.
  const picked = useLocationPickerStore((s) => s.picked);
  const setPicked = useLocationPickerStore((s) => s.setPicked);
  const captured = useSpotCameraStore((s) => s.captured);
  const setCaptured = useSpotCameraStore((s) => s.setCaptured);

  // Form fields and the chosen photo. `image.base64` is what gets uploaded
  // and what is sent to the AI caption function.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bestTime, setBestTime] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  const [image, setImage] = useState<{ uri: string; base64: string } | null>(null);
  // Extra capture metadata (GPS, altitude, place, weather) that only exists
  // when the photo came from the in-app geo-tag camera; null for library picks.
  const [captureGeoData, setCaptureGeoData] = useState<CapturedPhoto | null>(null);
  // Optional photo style. The ref points at the rendered PhotoStyleFrame so
  // it can be captured to an image on save.
  const [photoStyle, setPhotoStyle] = useState<PhotoStyleKey>('none');
  const [styleCaption, setStyleCaption] = useState('');
  const [styleCaptionFont, setStyleCaptionFont] = useState<CaptionFontKey>('displayItalic');
  const stylePreviewRef = useRef<View>(null);
  const { width } = useWindowDimensions();
  // UI flags: saving spinner, expanded genre list, time-of-day chip,
  // free-text genre mode, and the AI caption spinner.
  const [saving, setSaving] = useState(false);
  const [showMoreGenres, setShowMoreGenres] = useState(false);
  const [timeOfDay, setTimeOfDay] = useState<string | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [generatingCaption, setGeneratingCaption] = useState(false);

  // Location state: which input mode is active ('here' = GPS, 'remote' =
  // search), the search text, the confirmed location, and a busy flag
  // shared by GPS detection and search.
  const [locationMode, setLocationMode] = useState<'here' | 'remote'>('here');
  const [placeQuery, setPlaceQuery] = useState('');
  const [resolvedLocation, setResolvedLocation] = useState<ResolvedLocation | null>(null);
  const [resolvingLocation, setResolvingLocation] = useState(false);

  // useFocusEffect runs its callback whenever this screen gains focus, which
  // includes coming back from a modal. When /pick-location has left a pin in
  // the store, adopt it as the spot's location, then clear the store so the
  // same value isn't re-applied on a later focus.
  useFocusEffect(
    useCallbackSafe(() => {
      if (picked) {
        setResolvedLocation(picked);
        setPicked(null);
      }
    }, [picked])
  );

  // Same handoff for the geo-tag camera: take the captured photo and its
  // metadata out of the store, then clear the store.
  useFocusEffect(
    useCallbackSafe(() => {
      if (captured) {
        setImage({ uri: captured.uri, base64: captured.base64 });
        setCaptureGeoData(captured);
        setCaptured(null);
      }
    }, [captured])
  );

  /**
   * Gets a photo from the system camera or photo library via expo-image-picker.
   * Asks for the matching permission first and shows an alert if denied.
   * Requests base64 at quality 0.6 so the photo is compressed before upload
   * (the base64 string is what gets uploaded later). The "Camera" button in
   * the UI opens /spot-camera instead, so only 'library' is used from JSX.
   */
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
    // Ignore a cancelled picker, or a result that somehow came back without base64.
    if (!result.canceled && result.assets[0].base64) {
      setImage({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
    }
  }

  /**
   * Builds a "City, Region, Country" label from an expo-location reverse
   * geocode result, falling back to the subregion when there's no city, and
   * to `fallback` when nothing usable came back.
   */
  function labelFromPlace(place: Location.LocationGeocodedAddress | undefined, fallback: string) {
    return [place?.city || place?.subregion, place?.region, place?.country].filter(Boolean).join(', ') || fallback;
  }

  /**
   * "I'm here now" mode: asks for when-in-use location permission, reads the
   * device's current position, reverse-geocodes it to a label, and stores it
   * as the resolved location. Shows an alert on denial or failure.
   */
  async function detectCurrentLocation() {
    setResolvingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location needed', 'Enable location access to detect where you are.');
        return;
      }
      // Balanced accuracy is a speed/battery trade-off; spot-level precision
      // can still be refined afterwards on the map picker.
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

  /**
   * "From another trip" mode: forward-geocodes the typed place name, takes the
   * first match, then reverse-geocodes those coordinates so the label is in
   * the same "City, Region, Country" format as GPS detection. Falls back to
   * the user's own query text as the label.
   */
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

  /** Switches between GPS and search modes, discarding any location resolved under the previous mode. */
  function switchMode(mode: 'here' | 'remote') {
    setLocationMode(mode);
    setResolvedLocation(null);
    setPlaceQuery('');
  }

  /**
   * Opens the tap-to-pin map modal. If a location is already resolved, its
   * coordinates are passed as route params so the map opens centred there;
   * otherwise pick-location uses its own default centre. The result comes
   * back through `useLocationPickerStore` (see the useFocusEffect above).
   */
  function openLocationPicker() {
    const base = resolvedLocation;
    router.push({
      pathname: '/pick-location',
      params: base ? { lat: String(base.lat), lng: String(base.lng) } : {},
    });
  }

  /**
   * AI caption assistant: sends the photo's base64 to the `generate-caption`
   * Edge Function (via lib/ai.ts) and fills the title and description fields
   * with the suggestion. Overwrites anything already typed; the user can
   * still edit the result.
   */
  async function handleSuggestCaption() {
    if (!image) return;
    setGeneratingCaption(true);
    try {
      const result = await generateCaption(image.base64);
      setTitle(result.title);
      setDescription(result.description);
    } catch (err: any) {
      // lib/ai.ts already turns Edge Function errors into a readable sentence.
      Alert.alert('Could not generate a suggestion', err.message ?? 'Try again, or write your own.');
    } finally {
      setGeneratingCaption(false);
    }
  }

  /**
   * Validates the form, uploads the photo(s), and inserts the spot row.
   * Side effects: Supabase Storage uploads, a `spots` insert, an alert, and
   * router.back() on success.
   */
  async function handleSubmit() {
    // Required fields: title, genre, photo, and a resolved location.
    if (!title || !genre || !image) {
      Alert.alert('Almost there', 'Add a title, a genre, and a photo before saving.');
      return;
    }
    if (!resolvedLocation) {
      Alert.alert('Location needed', locationMode === 'here' ? 'Tap "Detect my location" first.' : 'Search and confirm a place first.');
      return;
    }
    // Screen is behind the onboarded auth guard, so this is only a type-narrowing safety check.
    if (!session) return;

    setSaving(true);
    try {
      // Upload the original photo. The object key starts with the user's id
      // because the bucket's storage policy only allows inserts into the
      // owner's own folder. React Native has no usable Blob, so the base64
      // string is decoded to an ArrayBuffer first.
      const fileName = `${session.user.id}/${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('spot-photos')
        .upload(fileName, decode(image.base64), { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      // The bucket is public-read, so a plain public URL is stored on the spot.
      const { data: publicUrlData } = supabase.storage.from('spot-photos').getPublicUrl(fileName);

      // If a style was chosen, snapshot the on-screen PhotoStyleFrame preview
      // into a JPEG and upload it as a second file, stored separately in
      // `styled_photo_url` so the original photo is kept untouched.
      let styledPhotoUrl: string | null = null;
      if (photoStyle !== 'none') {
        const styledBase64 = await captureViewAsBase64(stylePreviewRef);
        const styledFileName = `${session.user.id}/${Date.now()}_styled.jpg`;
        const { error: styledUploadError } = await supabase.storage
          .from('spot-photos')
          .upload(styledFileName, decode(styledBase64), { contentType: 'image/jpeg' });
        if (styledUploadError) throw styledUploadError;
        styledPhotoUrl = supabase.storage.from('spot-photos').getPublicUrl(styledFileName).data.publicUrl;
      }

      // Insert the spot row (writes go straight to tables; reads use RPCs).
      // The capture_* and weather_* columns are only filled for photos from
      // the in-app camera. `location` is sent as EWKT text
      // ("SRID=4326;POINT(lng lat)") which PostGIS parses into its geography
      // column; note that longitude comes first.
      const { error: insertError } = await supabase.from('spots').insert({
        title,
        description: description || null,
        best_time: bestTime || null,
        genre,
        time_of_day: timeOfDay,
        photo_url: publicUrlData.publicUrl,
        styled_photo_url: styledPhotoUrl,
        capture_lat: captureGeoData?.lat ?? null,
        capture_lng: captureGeoData?.lng ?? null,
        capture_altitude: captureGeoData?.altitude ?? null,
        captured_at: captureGeoData?.capturedAt ?? null,
        capture_place_name: captureGeoData?.placeName ?? null,
        capture_address: captureGeoData?.address ?? null,
        weather_temp_c: captureGeoData?.weatherTempC ?? null,
        weather_condition: captureGeoData?.weatherCondition ?? null,
        location: `SRID=4326;POINT(${resolvedLocation.lng} ${resolvedLocation.lat})`,
        location_label: resolvedLocation.label,
        created_by: session.user.id,
      });
      if (insertError) throw insertError;

      Alert.alert('Spot added', 'Your spot is now live on the map.');
      router.back();
    } catch (err: any) {
      // Any upload or insert failure lands here. Files already uploaded
      // before the failure are not removed.
      Alert.alert('Something went wrong', err.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // Layout: custom top bar, then a keyboard-aware scrolling form with
  // photo, style, AI caption, title, location, genre, time, tips, and save.
  return (
    <ScreenBackground>
      {/* Hide the native modal header; this screen draws its own top bar. */}
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.topBarTitle}>Add a spot</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* KeyboardAwareScrollView scrolls the focused TextInput above the keyboard. */}
      <KeyboardAwareScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" enableOnAndroid extraScrollHeight={28}>
        {/* Photo: preview once chosen, otherwise Camera (geo-tag camera) and Library buttons. */}
        <Text style={styles.label}>Photo</Text>
        {image ? (
          <Image source={{ uri: image.uri }} style={styles.preview} />
        ) : (
          <View style={styles.photoButtons}>
            <Pressable style={styles.photoBtn} onPress={() => router.push('/spot-camera')}><Text style={styles.photoBtnText}>Camera</Text></Pressable>
            <Pressable style={styles.photoBtn} onPress={() => pickImage('library')}><Text style={styles.photoBtnText}>Library</Text></Pressable>
          </View>
        )}
        {/* Clearing the photo also drops any camera geo metadata tied to it. */}
        {image && <Pressable onPress={() => { setImage(null); setCaptureGeoData(null); }}><Text style={styles.retake}>Choose a different photo</Text></Pressable>}

        {/* Optional photo style. The styled preview is also the View captured on save. */}
        {image && (
          <>
            <Text style={styles.label}>Add a style (optional)</Text>
            <PhotoStylePicker value={photoStyle} onChange={setPhotoStyle} />
            {photoStyle !== 'none' && (
              <>
                <View style={styles.stylePreviewWrap}>
                  <PhotoStyleFrame photoUri={image.uri} style={photoStyle} caption={styleCaption} captionFont={styleCaptionFont} size={Math.min(width - 96, 280)} innerRef={stylePreviewRef} />
                </View>
                <TextInput
                  style={[styles.input, { marginTop: 14 }]}
                  placeholder="Caption on the photo (optional)"
                  placeholderTextColor={theme.color.muted}
                  value={styleCaption}
                  onChangeText={setStyleCaption}
                  maxLength={80}
                />
                <Text style={[styles.label, { marginTop: 14 }]}>Caption font</Text>
                <CaptionFontPicker value={styleCaptionFont} onChange={setStyleCaptionFont} />
              </>
            )}
          </>
        )}

        {/* AI caption assistant, only offered once there is a photo to describe. */}
        {image && (
          <Pressable onPress={handleSuggestCaption} style={styles.aiSuggestBtn} disabled={generatingCaption}>
            {generatingCaption ? <ActivityIndicator color={theme.color.gold} size="small" /> : <Text style={styles.aiSuggestText}>✨ Suggest title & description</Text>}
          </Pressable>
        )}

        <Text style={styles.label}>Title</Text>
        <TextInput style={styles.input} placeholder="e.g. Marina Overlook" placeholderTextColor={theme.color.muted} value={title} onChangeText={setTitle} />

        {/* Location: mode toggle between GPS ("I'm here now") and search ("From another trip"). */}
        <Text style={styles.label}>Location</Text>
        <View style={styles.modeRow}>
          <Pressable onPress={() => switchMode('here')} style={[styles.modeChip, locationMode === 'here' && styles.chipSelected]}>
            <Text style={[styles.chipText, locationMode === 'here' && styles.chipTextSelected]}>I'm here now</Text>
          </Pressable>
          <Pressable onPress={() => switchMode('remote')} style={[styles.modeChip, locationMode === 'remote' && styles.chipSelected]}>
            <Text style={[styles.chipText, locationMode === 'remote' && styles.chipTextSelected]}>From another trip</Text>
          </Pressable>
        </View>

        {/* The action for the active mode: a GPS detect button, or a search box with a Find button. */}
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

        {/* Once a location is resolved: show its label and offer map fine-tuning. */}
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
        {/* In search mode with nothing resolved yet, the map picker is offered as the third way in. */}
        {!resolvedLocation && locationMode === 'remote' && (
          <Pressable onPress={openLocationPicker} style={styles.fineTuneBtn}>
            <Ionicons name="map-outline" size={14} color={theme.color.gold} />
            <Text style={styles.fineTuneText}>Or pick location directly on map</Text>
          </Pressable>
        )}

        {/* Genre chips. "Custom" sets genre to '' and shows a free-text field that edits it directly. */}
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

        {/* Time of day: optional single-select chips. */}
        <Text style={styles.label}>Time of day</Text>
        <View style={styles.row}>
          {TIME_PERIODS.map((t) => (
            <Pressable key={t} onPress={() => setTimeOfDay(t)} style={[styles.chip, timeOfDay === t && styles.chipSelected]}>
              <Text style={[styles.chipText, timeOfDay === t && styles.chipTextSelected]}>{t}</Text>
            </Pressable>
          ))}
        </View>

        {/* Free-text shooting tips: best time and description. */}
        <Text style={styles.label}>Best time to shoot</Text>
        <TextInput style={styles.input} placeholder="e.g. 6:10 AM · golden hour" placeholderTextColor={theme.color.muted} value={bestTime} onChangeText={setBestTime} />

        <Text style={styles.label}>Description (optional)</Text>
        <TextInput style={[styles.input, styles.multiline]} placeholder="Any tips for other photographers?" placeholderTextColor={theme.color.muted} value={description} onChangeText={setDescription} multiline />

        {/* Submit button; disabled and showing a spinner while uploading. */}
        <Pressable style={styles.submit} onPress={handleSubmit} disabled={saving}>
          {saving ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.submitText}>Save spot</Text>}
        </Pressable>
      </KeyboardAwareScrollView>
    </ScreenBackground>
  );
}

// Plain re-export so the file only needs one import line for useCallback
/**
 * Thin wrapper around React's useCallback, loaded with require() at call
 * time. Behaves the same as useCallback(fn, deps); it is used above to wrap
 * the useFocusEffect callbacks.
 */
function useCallbackSafe<T extends (...args: any[]) => any>(fn: T, deps: any[]) {
  const React = require('react');
  return React.useCallback(fn, deps);
}

// Styles use design tokens (colors, fonts, radii) from constants/theme.ts.
const styles = StyleSheet.create({
  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  // Form layout, labels, inputs, and chips
  container: { padding: 24, paddingBottom: 60, paddingTop: 4 },
  label: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, marginTop: 18, marginBottom: 8 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 12, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15, borderWidth: 1, borderColor: theme.color.surface2 },
  multiline: { height: 90, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.color.surface2 },
  chipSelected: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  chipText: { color: theme.color.cream, fontSize: 13, fontFamily: theme.font.bodyRegular },
  chipTextSelected: { color: theme.color.dusk, fontFamily: theme.font.body },
  // Photo picker, preview, style preview, and AI suggest button
  photoButtons: { flexDirection: 'row', gap: 12 },
  photoBtn: { flex: 1, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.sm, paddingVertical: 24, alignItems: 'center' },
  photoBtnText: { color: theme.color.cream, fontFamily: theme.font.body },
  preview: { width: '100%', height: 200, borderRadius: theme.radius.sm },
  stylePreviewWrap: { alignItems: 'center', marginTop: 14 },
  retake: { color: theme.color.gold, fontFamily: theme.font.bodyRegular, fontSize: 12, marginTop: 8, textAlign: 'center' },
  aiSuggestBtn: { marginTop: 10, borderWidth: 1, borderColor: theme.color.gold, borderRadius: 20, paddingVertical: 9, alignItems: 'center' },
  aiSuggestText: { fontFamily: theme.font.body, fontSize: 12.5, color: theme.color.gold },
  // Location section
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
  // Submit button
  submit: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
  submitText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
});