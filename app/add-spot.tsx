/**
 * Route: /add-spot, "Add a spot" modal, and "Edit spot" with `?editId=<id>`.
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
 * Edit mode (`editId`): the same form, loaded from the existing spot. The
 * owner can change the text, place name, photos and cover, and the photo
 * style, and nudge the pin (up to 2 km from where it was first posted; the
 * server enforces this too). "I'm here now" and search are hidden, since a
 * different place would be a different spot. Saving goes through
 * updateSpot (lib/spotSave.ts); new spots through createSpot.
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
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, Image, StyleSheet, Alert, ActivityIndicator, useWindowDimensions } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter, useFocusEffect, useLocalSearchParams, useNavigation, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { generateCaption } from '@/lib/ai';
import { placeDetails, geocodePlace, type PlaceDetails } from '@/lib/geocoding';
import { LocationDetailsCard } from '@/components/LocationDetailsCard';
import { FieldLabel } from '@/components/FieldLabel';
import { stillNeeded } from '@/lib/validation';
import { haversineMeters } from '@/lib/clusterSpots';
import { ScreenBackground } from '@/components/ScreenBackground';
import { PhotoStyleFrame, type PhotoStyleKey, type CaptionFontKey } from '@/components/PhotoStyleFrame';
import { PhotoStylePicker } from '@/components/PhotoStylePicker';
import { CaptionFontPicker } from '@/components/CaptionFontPicker';
import { captureViewAsBase64 } from '@/lib/media';
import { PhotoPickerStrip } from '@/components/PhotoPickerStrip';
import { MAX_SPOT_PHOTOS, resizeToJpeg, toLocalUri, fetchSpotPhotoRecords, pathFromPublicUrl } from '@/lib/spotPhotos';
import { createSpot, updateSpot, type OriginalSpot, type SpotDraft } from '@/lib/spotSave';
import type { DraftPhoto } from '@/lib/spotDraft';
import { useLocationPickerStore } from '@/store/locationPicker';
import { useSpotCameraStore, type CapturedPhoto } from '@/store/spotCamera';
import { KeyboardAwareScrollView } from '@codler/react-native-keyboard-aware-scroll-view';

// Genre chips. The core list shows by default; "More +" reveals the rest,
// and "Custom" lets the user type any genre as free text.
const CORE_GENRES = ['Street', 'Landscape', 'Portrait', 'Astro', 'Wildlife', 'Architecture', 'Travel'];
const MORE_GENRES = ['Macro', 'Aerial', 'Long Exposure', 'Black & White', 'Night', 'Urban', 'Nature', 'Minimalist', 'Documentary', 'Abstract'];
// Values for the spot's `time_of_day` column, shown as single-select chips.
const TIME_PERIODS = ['Morning', 'Afternoon', 'Evening', 'Night'];

/** Valid PhotoStyleKey values, to check a style read back from the database. */
const STYLE_KEYS: PhotoStyleKey[] = ['none', 'polaroid', 'vintage', 'filmRetro', 'goldenHour', 'blueHour', 'noir'];

/** Furthest an edit may move the pin from where the spot was first posted (matches guard_spot_edit). */
const MAX_EDIT_MOVE_METERS = 2000;

/** A confirmed spot location: coordinates plus the address parts found for them. */
type ResolvedLocation = { lat: number; lng: number; details: PlaceDetails };

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
  const navigation = useNavigation();
  // Edit mode: the id of the spot being edited, from /spot/[id]'s Edit button.
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const isEdit = !!editId;
  const [editLoading, setEditLoading] = useState(isEdit);
  const [editLoadError, setEditLoadError] = useState(false);
  // The spot as it was when the screen opened: what updateSpot diffs against.
  const originalRef = useRef<OriginalSpot | null>(null);
  // Where it was first posted: the 2 km limit is measured from here.
  const [editOrigin, setEditOrigin] = useState<{ lat: number; lng: number } | null>(null);
  // JSON of the loaded form, to tell whether anything was changed.
  const [initialSnapshot, setInitialSnapshot] = useState<string | null>(null);
  // Set once a save succeeds, so leaving afterwards doesn't ask to discard.
  const leavingRef = useRef(false);
  // Bumped by "Try again" on the load error, to re-run the load.
  const [loadAttempt, setLoadAttempt] = useState(0);
  // The spot has a style from before style settings were saved: it can only
  // be kept or removed, not re-applied.
  const [hasOldStyle, setHasOldStyle] = useState(false);
  const [removeOldStyle, setRemoveOldStyle] = useState(false);
  // Local copy of a remote cover for the style preview: the styled snapshot
  // is captured from the preview, and a still-downloading remote image would
  // come out blank.
  const [framedUri, setFramedUri] = useState<string | null>(null);
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
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const hero = photos[0]?.uri ?? null;
  // Extra capture metadata (GPS, altitude, place, weather) that only exists
  // when the photo came from the in-app geo-tag camera; null for library picks.
  // It describes the spot, so it's taken from the first camera capture only,
  // and dropped if that photo is removed (its `uri` identifies it).
  // Edit mode never changes a spot's geo-tag data: a camera shot added while
  // editing becomes just another photo.
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
  // Set by the first Save that finds something missing: from then on each
  // still-empty required field is flagged next to its label.
  const [showMissing, setShowMissing] = useState(false);

  // Location state: which input mode is active ('here' = GPS, 'remote' =
  // search), the search text, the confirmed location, and a busy flag
  // shared by GPS detection and search.
  const [locationMode, setLocationMode] = useState<'here' | 'remote'>('here');
  const [placeQuery, setPlaceQuery] = useState('');
  const [resolvedLocation, setResolvedLocation] = useState<ResolvedLocation | null>(null);
  const [resolvingLocation, setResolvingLocation] = useState(false);
  // The place's name as the user wants it shown. Geocoders often name a
  // specific spot after the nearest town, so this is prefilled but editable.
  const [placeName, setPlaceName] = useState('');
  // Once the user edits the name, a re-resolved pin (fine-tuning on the map)
  // updates the address and coordinates but never overwrites their name.
  const nameEditedRef = useRef(false);
  // What the user searched for in "From another trip": they know what the
  // place is called, so that beats any geocoder name as the default.
  const searchedNameRef = useRef<string | null>(null);
  // Where that searched name applies: moving the pin far from it on the map
  // means it's a different place, so the searched name no longer fits.
  const searchedAtRef = useRef<{ lat: number; lng: number } | null>(null);
  // Bumped by every GPS detect, search and mode switch, so a slow reply from
  // an earlier one can't overwrite a newer location.
  const locRequestRef = useRef(0);

  /**
   * Adopts a resolved point. The default name is, in order: the user's own
   * search text, the OpenStreetMap feature name, the locality.
   */
  function applyLocation(loc: ResolvedLocation) {
    const at = searchedAtRef.current;
    if (at && haversineMeters(at.lat, at.lng, loc.lat, loc.lng) > 500) {
      searchedNameRef.current = null;
      searchedAtRef.current = null;
    }
    setResolvedLocation(loc);
    if (!nameEditedRef.current) {
      setPlaceName(searchedNameRef.current ?? loc.details.name ?? loc.details.locality ?? '');
    }
  }

  /** Name field edits; marks the name as the user's own. */
  function changePlaceName(name: string) {
    nameEditedRef.current = true;
    setPlaceName(name);
  }

  // useFocusEffect runs its callback whenever this screen gains focus, which
  // includes coming back from a modal. When /pick-location has left a pin in
  // the store, adopt it as the spot's location, then clear the store so the
  // same value isn't re-applied on a later focus.
  useFocusEffect(
    useCallbackSafe(() => {
      if (picked) {
        applyLocation(picked);
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
        setPhotos((prev) => (prev.length < MAX_SPOT_PHOTOS ? [...prev, { uri: captured.uri, width: captured.width || null, height: captured.height || null }] : prev));
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
    const picked: DraftPhoto[] = result.assets.map((a) => ({ uri: a.uri, width: a.width || null, height: a.height || null }));
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
    const request = ++locRequestRef.current;
    // A fresh detection is a fresh place: offer its default name again.
    nameEditedRef.current = false;
    searchedNameRef.current = null;
    searchedAtRef.current = null;
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
      // placeDetails never throws, so an address lookup problem can't
      // discard the GPS fix; the user can still type the name.
      const details = await placeDetails(latitude, longitude);
      if (request !== locRequestRef.current) return;
      applyLocation({ lat: latitude, lng: longitude, details });
    } catch (err: any) {
      Alert.alert('Could not detect location', err.message ?? 'Please try again.');
    } finally {
      setResolvingLocation(false);
    }
  }

  /**
   * "From another trip" mode: forward-geocodes the typed place name, takes the
   * first match, then looks up that point's address parts. The typed text
   * becomes the default place name: the user knows what the place is called,
   * while the geocoder tends to name it after the nearest town.
   *
   * Both steps go through lib/geocoding.ts, which falls back to OpenStreetMap
   * when the device geocoder fails. Before this, a failing label lookup (the
   * Android crash for Arunachal Pradesh places like Tawang) threw away a
   * search that had actually found the place.
   */
  async function searchPlace() {
    const query = placeQuery.trim();
    if (!query) return;
    const request = ++locRequestRef.current;
    setResolvingLocation(true);
    try {
      const hit = await geocodePlace(query);
      if (request !== locRequestRef.current) return;
      if (!hit) {
        Alert.alert('Not found', 'No matching location found — try a more specific search.');
        return;
      }
      const details = await placeDetails(hit.lat, hit.lng);
      if (request !== locRequestRef.current) return;
      // A new search is a new place: its text becomes the name again, even
      // if the previous place's name had been edited.
      nameEditedRef.current = false;
      searchedNameRef.current = query;
      searchedAtRef.current = { lat: hit.lat, lng: hit.lng };
      applyLocation({ lat: hit.lat, lng: hit.lng, details });
    } finally {
      setResolvingLocation(false);
    }
  }

  /** Switches between GPS and search modes, discarding any location resolved under the previous mode. */
  function switchMode(mode: 'here' | 'remote') {
    setLocationMode(mode);
    setResolvedLocation(null);
    setPlaceQuery('');
    setPlaceName('');
    nameEditedRef.current = false;
    searchedNameRef.current = null;
    searchedAtRef.current = null;
    locRequestRef.current++;
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
      // The address goes along too, so the picker doesn't look up the same point again.
      params: base
        ? {
            lat: String(base.lat), lng: String(base.lng), details: JSON.stringify(base.details),
            // Edit mode: the picker refuses points over 2 km from the original.
            ...(editOrigin ? { originLat: String(editOrigin.lat), originLng: String(editOrigin.lng), maxMeters: String(MAX_EDIT_MOVE_METERS) } : {}),
          }
        : {},
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
      // An existing spot's cover is a remote URL; the manipulator needs a local file.
      const { base64 } = await resizeToJpeg(await toLocalUri(hero), 1024);
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

  // Required fields, in form order, as "Still needed: …" names them.
  const requirements = [
    { ok: !!hero, name: 'a photo' },
    { ok: !!title.trim(), name: 'a title' },
    { ok: !!resolvedLocation, name: 'a location' },
    // The place name can only be filled once there's a location.
    { ok: !resolvedLocation || !!placeName.trim(), name: 'a place name' },
    { ok: !!genre?.trim(), name: 'a genre' },
  ];

  // The form as one value, for saving and for "has anything changed?".
  const draft: SpotDraft | null = useMemo(() => (resolvedLocation ? {
    title, description, bestTime, genre: genre ?? '', timeOfDay, photos,
    location: resolvedLocation, placeName,
    style: { key: photoStyle, caption: styleCaption, font: styleCaptionFont, removeOld: removeOldStyle },
  } : null), [title, description, bestTime, genre, timeOfDay, photos, resolvedLocation, placeName, photoStyle, styleCaption, styleCaptionFont, removeOldStyle]);
  const snapshot = useMemo(() => JSON.stringify(draft), [draft]);
  const dirty = isEdit && initialSnapshot !== null && snapshot !== initialSnapshot;

  // Edit mode: load the spot once into the form. This modal mounts fresh
  // each time it opens, so a plain effect is enough.
  // Keyed on the user id, not the session object: the session is replaced
  // on every token refresh (about hourly), which would reload the spot and
  // wipe edits in progress.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!editId || !userId) return;
    let cancelled = false;
    setEditLoading(true);
    setEditLoadError(false);
    (async () => {
      const [{ data: core, error: coreError }, { data: row, error: rowError }, records, { data: originRows }] = await Promise.all([
        // get_spot gives lat/lng (the table's geography column doesn't read back as numbers).
        supabase.rpc('get_spot', { spot_id: editId }).single(),
        supabase.from('spots')
          .select('title, description, best_time, genre, time_of_day, photo_url, styled_photo_url, photo_style, style_caption, style_caption_font, place_name, place_locality, place_district, place_state, place_country, place_postcode, location_label, created_by')
          .eq('id', editId).maybeSingle(),
        fetchSpotPhotoRecords(editId),
        // Where it was first posted (private; owner only): the 2 km limit's centre.
        supabase.rpc('get_spot_origin', { p_spot_id: editId }),
      ]);
      if (cancelled) return;
      const spot = row as null | {
        title: string; description: string | null; best_time: string | null; genre: string | null; time_of_day: string | null;
        photo_url: string | null; styled_photo_url: string | null; photo_style: string | null; style_caption: string | null; style_caption_font: string | null;
        place_name: string | null; place_locality: string | null; place_district: string | null; place_state: string | null;
        place_country: string | null; place_postcode: string | null; location_label: string | null; created_by: string | null;
      };
      const coords = core as { lat: number; lng: number } | null;
      if (coreError || rowError || !spot || !coords || spot.created_by !== userId) {
        setEditLoadError(true);
        setEditLoading(false);
        return;
      }

      // Photos: spot_photos rows in order, or (posted before multi-photo) just the cover.
      let loaded: DraftPhoto[] = records.map((r) => ({ uri: r.photo_url, width: r.width, height: r.height, storagePath: r.storage_path }));
      if (loaded.length === 0 && spot.photo_url) {
        const path = pathFromPublicUrl(spot.photo_url);
        if (path) {
          // Posted before multi-photo: its size was never stored, and
          // spot_photos needs one, so measure the image.
          const size = await new Promise<{ width: number; height: number } | null>((resolve) =>
            Image.getSize(spot.photo_url!, (width, height) => resolve({ width, height }), () => resolve(null))
          );
          if (cancelled) return;
          loaded = [{ uri: spot.photo_url, width: size?.width ?? null, height: size?.height ?? null, storagePath: path }];
        }
      }
      originalRef.current = {
        photoPaths: loaded.map((p) => p.storagePath!),
        photoRows: records.map(({ storage_path, width, height }) => ({ storage_path, width, height })),
        styledPhotoUrl: spot.styled_photo_url,
        style: { key: spot.photo_style, caption: spot.style_caption, font: spot.style_caption_font },
      };

      const g = spot.genre ?? '';
      const knownGenre = [...CORE_GENRES, ...MORE_GENRES].includes(g);
      const styleKey = STYLE_KEYS.includes(spot.photo_style as PhotoStyleKey) ? (spot.photo_style as PhotoStyleKey) : 'none';
      const loc = {
        lat: coords.lat, lng: coords.lng,
        details: { name: null, locality: spot.place_locality, district: spot.place_district, state: spot.place_state, country: spot.place_country, postcode: spot.place_postcode },
      };
      const name = spot.place_name ?? spot.location_label ?? '';

      setPhotos(loaded);
      setTitle(spot.title ?? '');
      setDescription(spot.description ?? '');
      setBestTime(spot.best_time ?? '');
      setGenre(g);
      setCustomMode(!!g && !knownGenre);
      setShowMoreGenres(MORE_GENRES.includes(g));
      setTimeOfDay(spot.time_of_day);
      setResolvedLocation(loc);
      setPlaceName(name);
      // Their name is theirs: fine-tuning the pin keeps it.
      nameEditedRef.current = true;
      setPhotoStyle(styleKey);
      setStyleCaption(spot.style_caption ?? '');
      setStyleCaptionFont((spot.style_caption_font as CaptionFontKey | null) ?? 'displayItalic');
      const origin = (originRows as { lat: number; lng: number }[] | null)?.[0];
      setEditOrigin(origin ?? { lat: coords.lat, lng: coords.lng });
      setHasOldStyle(!!spot.styled_photo_url && !spot.photo_style);
      setRemoveOldStyle(false);
      setInitialSnapshot(JSON.stringify({
        title: spot.title ?? '', description: spot.description ?? '', bestTime: spot.best_time ?? '', genre: g, timeOfDay: spot.time_of_day,
        photos: loaded, location: loc, placeName: name,
        style: { key: styleKey, caption: spot.style_caption ?? '', font: (spot.style_caption_font as CaptionFontKey | null) ?? 'displayItalic', removeOld: false },
      }));
      setEditLoading(false);
    })();
    return () => { cancelled = true; };
  }, [editId, userId, loadAttempt]);

  // Style preview source: a local copy of a remote (already stored) cover.
  useEffect(() => {
    let cancelled = false;
    if (!hero || photoStyle === 'none') { setFramedUri(null); return; }
    if (!hero.startsWith('http')) { setFramedUri(hero); return; }
    setFramedUri(null);
    toLocalUri(hero).then((uri) => { if (!cancelled) setFramedUri(uri); }).catch(() => { if (!cancelled) setFramedUri(hero); });
    return () => { cancelled = true; };
  }, [hero, photoStyle]);

  // Leaving an edit with unsaved changes asks first (back button, swipe, or
  // the hardware back key all go through beforeRemove).
  useEffect(() => {
    if (!isEdit) return;
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!dirty || leavingRef.current || saving) return;
      e.preventDefault();
      Alert.alert('Discard changes?', 'Your edits to this spot will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => { leavingRef.current = true; navigation.dispatch(e.data.action); } },
      ]);
    });
    return unsubscribe;
  }, [navigation, isEdit, dirty, saving]);

  /**
   * Validates the form, uploads the photos, and inserts the spot plus one
   * `spot_photos` row per photo. All-or-nothing: if any step fails, the spot
   * row (if created) and every uploaded file are removed, so a half-posted
   * spot never appears on the map.
   * Side effects: Supabase Storage uploads, `spots` and `spot_photos`
   * inserts, an alert, and router.back() on success.
   */
  async function handleSubmit() {
    // Name only what's actually missing, and flag those fields in the form.
    const message = stillNeeded(requirements);
    if (message) {
      setShowMissing(true);
      const hint = !resolvedLocation
        ? (locationMode === 'here' ? ' Tap "Detect my location" to set the location.' : ' Search for the place to set the location.')
        : '';
      Alert.alert('Almost there', message + hint);
      return;
    }
    // Screen is behind the onboarded auth guard, so this is only a type-narrowing safety check.
    if (!session || !draft) return;

    setSaving(true);
    const hooks = {
      // The style preview is on screen while saving, so it can be captured.
      renderStyled: () => captureViewAsBase64(stylePreviewRef),
      onProgress: (done: number, total: number) => setUploadProgress({ done, total }),
    };
    try {
      if (isEdit && editId && originalRef.current) {
        await updateSpot(session.user.id, editId, draft, originalRef.current, hooks);
        if (!mountedRef.current) return;
        leavingRef.current = true;
        Alert.alert('Spot updated', 'Your changes are live.');
        router.back();
      } else {
        await createSpot(session.user.id, draft, captureGeoData, hooks);
        // Closed mid-upload: the spot is posted, but there's nothing to go back from.
        if (!mountedRef.current) return;
        leavingRef.current = true;
        Alert.alert('Spot added', 'Your spot is now live on the map.');
        router.back();
      }
    } catch (err) {
      console.warn('add-spot save failed', err instanceof Error ? err.message : err);
      // A Postgres/PostgREST error carries a `code`; only blame the network
      // when the server never answered.
      const code = (err as { code?: unknown } | null)?.code;
      const serverRejected = typeof code === 'string';
      const nothing = isEdit ? 'Your spot is unchanged.' : 'Nothing was posted.';
      // 22023 is the app's own rule check (e.g. the 2 km move limit); its
      // message is written for people, so show it as is.
      if (code === '22023' && mountedRef.current) {
        Alert.alert(isEdit ? "Couldn't save your changes" : "Couldn't save your spot", `${(err as { message?: string }).message ?? ''} ${nothing}`.trim());
      } else if (mountedRef.current) {
        Alert.alert(
          isEdit ? "Couldn't save your changes" : "Couldn't save your spot",
          serverRejected
            ? `${nothing} Something went wrong on our side. Please try again in a moment.`
            : `${nothing} Check your connection and try again.`
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
      <Stack.Screen options={{ headerShown: false, gestureEnabled: !saving && !(isEdit && dirty) }} />
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} disabled={saving} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close">
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.topBarTitle}>{isEdit ? 'Edit spot' : 'Add a spot'}</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Edit mode: loading and error states replace the form until the spot is in. */}
      {isEdit && editLoading ? (
        <View style={styles.center}><ActivityIndicator color={theme.color.gold} accessibilityLabel="Opening your spot" /></View>
      ) : isEdit && editLoadError ? (
        <View style={styles.center}>
          <Text style={styles.centerText}>Couldn&apos;t open this spot for editing. Check your connection, or it may no longer be yours to edit.</Text>
          <Pressable onPress={() => setLoadAttempt((n) => n + 1)} style={styles.centerBtn} accessibilityRole="button">
            <Text style={styles.centerBtnText}>Try again</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.centerLink} accessibilityRole="button">
            <Text style={styles.centerLinkText}>Go back</Text>
          </Pressable>
        </View>
      ) : (
      /* KeyboardAwareScrollView scrolls the focused TextInput above the keyboard. */
      <KeyboardAwareScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" enableOnAndroid extraScrollHeight={80}>
        {/* Photos: cover preview plus the thumbnail strip once chosen, otherwise Camera (geo-tag camera) and Library buttons. */}
        <FieldLabel text={photos.length > 1 ? 'Photos' : 'Photo'} missing={showMissing && !hero} style={styles.label} />
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
            {/* An older style can't be re-applied: offer keep or remove (it goes anyway if the cover changes). */}
            {isEdit && hasOldStyle && photoStyle === 'none' && (
              <Pressable onPress={() => setRemoveOldStyle((v) => !v)} style={styles.oldStyleRow} accessibilityRole="checkbox" accessibilityState={{ checked: removeOldStyle }}>
                <Ionicons name={removeOldStyle ? 'checkbox' : 'square-outline'} size={18} color={theme.color.gold} />
                <Text style={styles.oldStyleText}>Remove the cover&apos;s current style</Text>
              </Pressable>
            )}
            {photoStyle !== 'none' && (
              <>
                <View style={styles.stylePreviewWrap}>
                  <PhotoStyleFrame photoUri={framedUri} style={photoStyle} caption={styleCaption} captionFont={styleCaptionFont} size={Math.min(width - 96, 280)} innerRef={stylePreviewRef} />
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

        <FieldLabel text="Title" missing={showMissing && !title.trim()} style={styles.label} />
        <TextInput style={styles.input} placeholder="e.g. Marina Overlook" placeholderTextColor={theme.color.muted} value={title} onChangeText={setTitle} />

        {/* Location: mode toggle between GPS ("I'm here now") and search ("From another trip"). Edit mode only fine-tunes. */}
        <FieldLabel text="Location" missing={showMissing && !resolvedLocation} style={styles.label} />
        {!isEdit && (
        <View style={styles.modeRow}>
          <Pressable onPress={() => switchMode('here')} style={[styles.modeChip, locationMode === 'here' && styles.chipSelected]}>
            <Text style={[styles.chipText, locationMode === 'here' && styles.chipTextSelected]}>I&apos;m here now</Text>
          </Pressable>
          <Pressable onPress={() => switchMode('remote')} style={[styles.modeChip, locationMode === 'remote' && styles.chipSelected]}>
            <Text style={[styles.chipText, locationMode === 'remote' && styles.chipTextSelected]}>From another trip</Text>
          </Pressable>
        </View>
        )}

        {/* The action for the active mode: a GPS detect button, or a search box with a Find button. */}
        {isEdit ? null : locationMode === 'here' ? (
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

        {/* Once a location is resolved: the editable place name, its address and exact coordinates, then map fine-tuning. */}
        {resolvedLocation && (
          <LocationDetailsCard
            lat={resolvedLocation.lat}
            lng={resolvedLocation.lng}
            details={resolvedLocation.details}
            name={placeName}
            onChangeName={changePlaceName}
          />
        )}
        {resolvedLocation && (
          <Pressable onPress={openLocationPicker} style={styles.fineTuneBtn} accessibilityRole="button">
            <Ionicons name="map-outline" size={14} color={theme.color.gold} />
            <Text style={styles.fineTuneText}>{isEdit ? 'Fine-tune the pin (up to 2 km)' : 'Fine-tune exact spot on map'}</Text>
          </Pressable>
        )}
        {/* In search mode with nothing resolved yet, the map picker is offered as the third way in. */}
        {!isEdit && !resolvedLocation && locationMode === 'remote' && (
          <Pressable onPress={openLocationPicker} style={styles.fineTuneBtn}>
            <Ionicons name="map-outline" size={14} color={theme.color.gold} />
            <Text style={styles.fineTuneText}>Or pick location directly on map</Text>
          </Pressable>
        )}

        {/* Genre chips. "Custom" sets genre to '' and shows a free-text field that edits it directly. */}
        <FieldLabel text="Genre" missing={showMissing && !genre?.trim()} style={styles.label} />
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
          style={[styles.submit, isEdit && !dirty && !saving && styles.submitDisabled]}
          onPress={handleSubmit}
          disabled={saving || (isEdit && !dirty)}
          accessibilityRole="button"
          accessibilityState={{ busy: saving, disabled: saving || (isEdit && !dirty) }}
          accessibilityLabel={uploadProgress ? `Uploading photo ${uploadProgress.done + 1} of ${uploadProgress.total}` : isEdit ? (dirty ? 'Save changes' : 'Save changes, no changes yet') : 'Save spot'}
        >
          {uploadProgress ? (
            <Text style={styles.submitText}>Uploading {uploadProgress.done + 1}/{uploadProgress.total}…</Text>
          ) : saving ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.submitText}>{isEdit ? 'Save changes' : 'Save spot'}</Text>}
        </Pressable>
      </KeyboardAwareScrollView>
      )}
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
  fineTuneBtn: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  fineTuneText: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.gold, textDecorationLine: 'underline' },
  // Submit button
  submit: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
  submitText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
  submitDisabled: { opacity: 0.5 },
  // Edit mode loading / error
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  centerText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', marginBottom: 16 },
  centerBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 24, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.gold },
  centerBtnText: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.gold },
  centerLink: { minHeight: 44, justifyContent: 'center', marginTop: 8 },
  centerLinkText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted },
  oldStyleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  oldStyleText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.cream },
});