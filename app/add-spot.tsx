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
 * - Photos: 1–10 per spot, from the in-app geo-tag camera (/spot-camera,
 *   one per trip) and/or the system library (expo-image-picker, several at
 *   once). The first photo is the cover, shown on the map pin; the rest are
 *   swiped through in the Feed and Spot Detail carousel. The camera hands
 *   its result back through the `useSpotCameraStore` Zustand store, including
 *   GPS, altitude, place name and weather captured at shutter time.
 * - Location, three ways: "I'm here now" (device GPS + reverse geocode),
 *   "From another trip" (text search via expo-location's geocoder), or
 *   tap-to-pin on /pick-location, which returns its choice through the
 *   `useLocationPickerStore` Zustand store.
 * - Optional photo style: a PhotoStyleFrame preview (polaroid, vintage, etc.)
 *   is rendered on screen and, on save, captured to a second JPEG.
 * - Optional AI caption: `generateCaption` (lib/ai.ts) calls a Supabase Edge
 *   Function that suggests a title and description from the photo.
 * - Save: resizes and uploads each photo (and the styled cover, if any) to
 *   the `spot-photos` bucket under the user's id folder, inserts the `spots`
 *   row with a PostGIS point, then one `spot_photos` row per photo. Any
 *   failure rolls all of it back (see lib/spotPhotos.ts).
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
import { useEffect, useRef, useState } from 'react';
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
import { placeLabel, geocodePlace } from '@/lib/geocoding';
import { ScreenBackground } from '@/components/ScreenBackground';
import { PhotoStyleFrame, type PhotoStyleKey, type CaptionFontKey } from '@/components/PhotoStyleFrame';
import { PhotoStylePicker } from '@/components/PhotoStylePicker';
import { CaptionFontPicker } from '@/components/CaptionFontPicker';
import { captureViewAsBase64 } from '@/lib/media';
import { PhotoPickerStrip } from '@/components/PhotoPickerStrip';
import { MAX_SPOT_PHOTOS, resizeToJpeg, uploadSpotPhoto, removeSpotFiles, type UploadedPhoto } from '@/lib/spotPhotos';
import { useLocationPickerStore } from '@/store/locationPicker';
import { useSpotCameraStore, type CapturedPhoto } from '@/store/spotCamera';
import { KeyboardAwareScrollView } from '@codler/react-native-keyboard-aware-scroll-view';

// Genre chips. The core list shows by default; "More +" reveals the rest,
// and "Custom" lets the user type any genre as free text.
const CORE_GENRES = ['Street', 'Landscape', 'Portrait', 'Astro', 'Wildlife', 'Architecture', 'Travel'];
const MORE_GENRES = ['Macro', 'Aerial', 'Long Exposure', 'Black & White', 'Night', 'Urban', 'Nature', 'Minimalist', 'Documentary', 'Abstract'];
// Values for the spot's `time_of_day` column, shown as single-select chips.
const TIME_PERIODS = ['Morning', 'Afternoon', 'Evening', 'Night'];

/** A photo chosen for the post. width/height come from the library picker; null for camera shots. */
type PickedPhoto = { uri: string; width: number | null; height: number | null };

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

  // Form fields and the chosen photos, 1–MAX_SPOT_PHOTOS of them. photos[0]
  // is the cover (hero). Only URIs (plus the picker's pixel size, when
  // known, which saves a decode at resize time) are held in state; each
  // photo is resized and base64-encoded at upload time, so ten photos don't
  // sit in memory as base64 strings.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bestTime, setBestTime] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const hero = photos[0]?.uri ?? null;
  // Extra capture metadata (GPS, altitude, place, weather) that only exists
  // when the photo came from the in-app geo-tag camera; null for library picks.
  // It describes the spot, so it's taken from the first camera capture only,
  // and dropped if that photo is removed (its `uri` identifies it).
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
  // "Uploading 3/7…" on the save button while photos go up one by one.
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  // Guards the post-save alert and router.back(): if the modal was closed
  // while uploading, backing out again would pop an unrelated screen.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
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

  // Same handoff for the geo-tag camera: append the captured photo (unless
  // the post is already full), keep the first capture's metadata, then clear
  // the store.
  useFocusEffect(
    useCallbackSafe(() => {
      if (captured) {
        setPhotos((prev) => (prev.length < MAX_SPOT_PHOTOS ? [...prev, { uri: captured.uri, width: null, height: null }] : prev));
        setCaptureGeoData((prev) => prev ?? captured);
        setCaptured(null);
      }
    }, [captured])
  );

  /**
   * Adds photos from the system library via expo-image-picker, several at a
   * time, up to the remaining room under MAX_SPOT_PHOTOS. Asks for
   * permission first and shows an alert if denied. No compression here:
   * uploadSpotPhoto resizes each one at save time.
   */
  async function pickFromLibrary() {
    const room = MAX_SPOT_PHOTOS - photos.length;
    if (room <= 0) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to add photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      // Respected on Android 13+ / iOS 14+; the slice below enforces it everywhere else.
      selectionLimit: room,
      orderedSelection: true,
    });
    if (result.canceled) return;
    const picked: PickedPhoto[] = result.assets.map((a) => ({ uri: a.uri, width: a.width || null, height: a.height || null }));
    setPhotos((prev) => {
      // Skip duplicates (the same library photo picked twice) and cap the total.
      const fresh = picked.filter((p) => !prev.some((q) => q.uri === p.uri));
      return [...prev, ...fresh].slice(0, MAX_SPOT_PHOTOS);
    });
  }

  /** "+" tile in the photo strip: choose between the geo-tag camera and the library. */
  function addMorePhotos() {
    Alert.alert('Add photos', undefined, [
      { text: 'Camera', onPress: () => router.push('/spot-camera') },
      { text: 'Library', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  /** Moves the photo at `index` to the front, making it the cover. */
  function makeCover(index: number) {
    setPhotos((prev) => [prev[index], ...prev.filter((_, i) => i !== index)]);
  }

  /**
   * Removes one photo. Removing the camera shot the geo metadata came from
   * also drops that metadata, so a deleted photo's GPS and weather are never
   * saved on the spot.
   */
  function removePhoto(index: number) {
    const removed = photos[index];
    setPhotos(photos.filter((_, i) => i !== index));
    if (captureGeoData && removed?.uri === captureGeoData.uri) setCaptureGeoData(null);
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
      // placeLabel never throws (it falls back to OpenStreetMap when the
      // device geocoder fails), so a label problem can't discard the GPS fix.
      const label = await placeLabel(latitude, longitude);
      setResolvedLocation({ lat: latitude, lng: longitude, label: label ?? 'Location detected' });
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
   *
   * Both steps go through lib/geocoding.ts, which falls back to OpenStreetMap
   * when the device geocoder fails. Before this, a failing label lookup (the
   * Android crash for Arunachal Pradesh places like Tawang) threw away a
   * search that had actually found the place.
   */
  async function searchPlace() {
    const query = placeQuery.trim();
    if (!query) return;
    setResolvingLocation(true);
    try {
      const hit = await geocodePlace(query);
      if (!hit) {
        Alert.alert('Not found', 'No matching location found — try a more specific search.');
        return;
      }
      const label = await placeLabel(hit.lat, hit.lng);
      setResolvedLocation({ lat: hit.lat, lng: hit.lng, label: label ?? query });
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
    if (!hero) return;
    setGeneratingCaption(true);
    try {
      // The cover photo, shrunk: the model doesn't need full resolution and
      // a smaller payload keeps the Edge Function call quick.
      const { base64 } = await resizeToJpeg(hero, 1024);
      const result = await generateCaption(base64);
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
   * Validates the form, uploads the photos, and inserts the spot plus one
   * `spot_photos` row per photo. All-or-nothing: if any step fails, the spot
   * row (if created) and every uploaded file are removed, so a half-posted
   * spot never appears on the map.
   * Side effects: Supabase Storage uploads, `spots` and `spot_photos`
   * inserts, an alert, and router.back() on success.
   */
  async function handleSubmit() {
    // Required fields: title, genre, at least one photo, and a resolved location.
    if (!title || !genre || !hero) {
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
    // Everything uploaded or created so far, for the rollback in `catch`.
    const uploadedPaths: string[] = [];
    let spotId: string | null = null;
    // Snapshot: the strip is disabled while saving, but the loop must not
    // depend on state that could change under it.
    const toUpload = photos;
    try {
      // Upload every photo, one at a time (gentler on mobile data than ten
      // parallel uploads). uploadSpotPhoto resizes each and writes it under
      // the user's id folder, the only folder the bucket policy allows.
      const uploaded: UploadedPhoto[] = [];
      for (let i = 0; i < toUpload.length; i++) {
        setUploadProgress({ done: i, total: toUpload.length });
        const { uri, width: w, height: h } = toUpload[i];
        const photo = await uploadSpotPhoto(session.user.id, uri, i, w && h ? { width: w, height: h } : undefined);
        uploadedPaths.push(photo.storage_path);
        uploaded.push(photo);
      }
      setUploadProgress(null);

      // If a style was chosen, snapshot the on-screen PhotoStyleFrame preview
      // (of the cover) into a JPEG and upload it as an extra file, stored in
      // `styled_photo_url` so the original photo is kept untouched. React
      // Native has no usable Blob, so base64 is decoded to an ArrayBuffer.
      let styledPhotoUrl: string | null = null;
      if (photoStyle !== 'none') {
        const styledBase64 = await captureViewAsBase64(stylePreviewRef);
        const styledFileName = `${session.user.id}/${Date.now()}_styled.jpg`;
        const { error: styledUploadError } = await supabase.storage
          .from('spot-photos')
          .upload(styledFileName, decode(styledBase64), { contentType: 'image/jpeg' });
        if (styledUploadError) throw styledUploadError;
        uploadedPaths.push(styledFileName);
        styledPhotoUrl = supabase.storage.from('spot-photos').getPublicUrl(styledFileName).data.publicUrl;
      }

      // Insert the spot row (writes go straight to tables; reads use RPCs).
      // photo_url is the cover, so the map pin and every older reader of
      // this column show it. The capture_* and weather_* columns are only
      // filled for photos from the in-app camera. `location` is sent as EWKT
      // text ("SRID=4326;POINT(lng lat)") which PostGIS parses into its
      // geography column; note that longitude comes first.
      const { data: spotRow, error: insertError } = await supabase.from('spots').insert({
        title,
        description: description || null,
        best_time: bestTime || null,
        genre,
        time_of_day: timeOfDay,
        photo_url: uploaded[0].photo_url,
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
      }).select('id').single();
      if (insertError) throw insertError;
      spotId = spotRow.id;

      // One row per photo, cover at position 0, in a single insert.
      const { error: photosError } = await supabase.from('spot_photos').insert(
        uploaded.map((p, position) => ({ spot_id: spotId, position, storage_path: p.storage_path, width: p.width, height: p.height }))
      );
      if (photosError) throw photosError;

      // Closed mid-upload: the spot is posted, but there's nothing to go back from.
      if (!mountedRef.current) return;
      Alert.alert('Spot added', 'Your spot is now live on the map.');
      router.back();
    } catch (err) {
      console.warn('add-spot save failed', err instanceof Error ? err.message : err);
      // Roll back so nothing half-posted is left behind: deleting the spot
      // cascades to any spot_photos rows, then the files go. Both are
      // best-effort; the user-facing outcome is the same either way.
      if (spotId) await supabase.from('spots').delete().eq('id', spotId);
      await removeSpotFiles(uploadedPaths);
      // A Postgres/PostgREST error carries a `code`; only blame the network
      // when the server never answered.
      const serverRejected = typeof (err as { code?: unknown } | null)?.code === 'string';
      if (mountedRef.current) {
        Alert.alert(
          "Couldn't save your spot",
          serverRejected
            ? 'Nothing was posted. Something went wrong on our side. Please try again in a moment.'
            : 'Nothing was posted. Check your connection and try again.'
        );
      }
    } finally {
      if (mountedRef.current) {
        setUploadProgress(null);
        setSaving(false);
      }
    }
  }

  // Layout: custom top bar, then a keyboard-aware scrolling form with
  // photo, style, AI caption, title, location, genre, time, tips, and save.
  return (
    <ScreenBackground>
      {/* Hide the native modal header (this screen draws its own top bar); no swipe-to-dismiss while a save is uploading. */}
      <Stack.Screen options={{ headerShown: false, gestureEnabled: !saving }} />
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} disabled={saving} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.topBarTitle}>Add a spot</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* KeyboardAwareScrollView scrolls the focused TextInput above the keyboard. */}
      <KeyboardAwareScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" enableOnAndroid extraScrollHeight={28}>
        {/* Photos: cover preview plus the thumbnail strip once chosen, otherwise Camera (geo-tag camera) and Library buttons. */}
        <Text style={styles.label}>{photos.length > 1 ? 'Photos' : 'Photo'}</Text>
        {hero ? (
          <>
            <Image source={{ uri: hero }} style={styles.preview} />
            <PhotoPickerStrip uris={photos.map((p) => p.uri)} onMakeCover={makeCover} onRemove={removePhoto} onAdd={addMorePhotos} disabled={saving} />
          </>
        ) : (
          <View style={styles.photoButtons}>
            <Pressable style={styles.photoBtn} onPress={() => router.push('/spot-camera')}><Text style={styles.photoBtnText}>Camera</Text></Pressable>
            <Pressable style={styles.photoBtn} onPress={pickFromLibrary}><Text style={styles.photoBtnText}>Library</Text></Pressable>
          </View>
        )}

        {/* Optional photo style, applied to the cover. The styled preview is also the View captured on save. */}
        {hero && (
          <>
            <Text style={styles.label}>{photos.length > 1 ? 'Style the cover (optional)' : 'Add a style (optional)'}</Text>
            <PhotoStylePicker value={photoStyle} onChange={setPhotoStyle} />
            {photoStyle !== 'none' && (
              <>
                <View style={styles.stylePreviewWrap}>
                  <PhotoStyleFrame photoUri={hero} style={photoStyle} caption={styleCaption} captionFont={styleCaptionFont} size={Math.min(width - 96, 280)} innerRef={stylePreviewRef} />
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
        {hero && (
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
            <Text style={[styles.chipText, locationMode === 'here' && styles.chipTextSelected]}>I&apos;m here now</Text>
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
        <Pressable
          style={styles.submit}
          onPress={handleSubmit}
          disabled={saving}
          accessibilityRole="button"
          accessibilityState={{ busy: saving }}
          accessibilityLabel={uploadProgress ? `Uploading photo ${uploadProgress.done + 1} of ${uploadProgress.total}` : 'Save spot'}
        >
          {uploadProgress ? (
            <Text style={styles.submitText}>Uploading {uploadProgress.done + 1}/{uploadProgress.total}…</Text>
          ) : saving ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.submitText}>Save spot</Text>}
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
  preview: { width: '100%', height: 200, borderRadius: theme.radius.sm, marginBottom: 6 },
  stylePreviewWrap: { alignItems: 'center', marginTop: 14 },
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