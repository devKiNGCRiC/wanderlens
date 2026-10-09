/**
 * Route: /pick-location, "Pick location" modal (tap-to-pin map).
 *
 * Purpose: lets the user place a spot's location precisely by tapping a
 * map. It is the third of add-spot's three location methods (GPS, search,
 * tap-to-pin), used both to fine-tune an already-resolved location and to
 * pick one from scratch. Registered as a modal inside the fully-onboarded
 * `<Stack.Protected>` guard in app/_layout.tsx.
 *
 * How it works:
 * - Optional `lat` / `lng` route params (strings) set the starting point;
 *   without them the map opens on fixed default coordinates. An optional
 *   `details` param (JSON) carries the address add-spot already has for that
 *   point, so reopening the picker doesn't look it up again.
 * - Tapping the map moves the pin and, after a short pause, looks up that
 *   exact point with placeDetails (lib/geocoding.ts: OpenStreetMap at street
 *   level, falling back to the device geocoder). The pause keeps quick
 *   exploratory taps within OpenStreetMap's ~1 request/second usage policy,
 *   and a superseded lookup is aborted.
 * - Edit mode passes `originLat` / `originLng` / `maxMeters`: a pin further
 *   than that from where the spot was first posted can't be confirmed (the
 *   server enforces the same limit).
 * - "Use this location" is disabled until the address for the CURRENT pin
 *   has arrived, so a pin can never be saved with another point's address.
 *   It writes { lat, lng, details } into the `useLocationPickerStore`
 *   Zustand store and goes back; add-spot reads the store on focus.
 *
 * Why MapLibre + OpenFreeMap: free tiles with no API key or billing account,
 * unlike react-native-maps with Google (see CLAUDE.md's stack table).
 */
import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, type NativeSyntheticEvent } from 'react-native';
import { Map, Camera, ViewAnnotation, type PressEvent } from '@maplibre/maplibre-react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { placeDetails, formatPlaceLine, formatDecimalCoords, type PlaceDetails } from '@/lib/geocoding';
import { useLocationPickerStore } from '@/store/locationPicker';
import { haversineMeters } from '@/lib/clusterSpots';
import { ScreenBackground } from '@/components/ScreenBackground';

// OpenFreeMap vector style, the same free tile source used by the other maps in the app.
const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// Wait this long after the last tap before looking the point up.
const LOOKUP_DELAY_MS = 800;

/** add-spot's details for the starting point, if it passed valid ones. */
function parseDetails(raw: string | undefined): PlaceDetails | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<PlaceDetails>;
    return {
      name: d.name ?? null, locality: d.locality ?? null, district: d.district ?? null,
      state: d.state ?? null, country: d.country ?? null, postcode: d.postcode ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * The tap-to-pin map screen. Keeps the pin position and its address in local
 * state and hands the confirmed choice back through the location-picker store.
 */
export default function PickLocation() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Route params always arrive as strings, so they are converted with Number() below.
  const params = useLocalSearchParams<{ lat?: string; lng?: string; details?: string; originLat?: string; originLng?: string; maxMeters?: string }>();
  const setPicked = useLocationPickerStore((s) => s.setPicked);

  // Start at the caller's coordinates, or at these fixed default coordinates
  // (20.5937, 78.9629) when none were passed.
  const initialLat = params.lat ? Number(params.lat) : 20.5937;
  const initialLng = params.lng ? Number(params.lng) : 78.9629;
  const initialDetails = parseDetails(params.details);

  // Current pin position and the address for exactly that position (null
  // while it is being looked up).
  const [point, setPoint] = useState<{ lat: number; lng: number }>({ lat: initialLat, lng: initialLng });
  const [details, setDetails] = useState<PlaceDetails | null>(initialDetails);
  const [resolving, setResolving] = useState(!initialDetails);
  // Only the latest tap's lookup may update the sheet; earlier ones are aborted.
  const lookupRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Looks up the address for a point after LOOKUP_DELAY_MS, cancelling any
   * pending or in-flight lookup. placeDetails never throws; if nothing is
   * found the sheet still shows the coordinates.
   */
  function resolveSoon(lat: number, lng: number, delay = LOOKUP_DELAY_MS) {
    const lookup = ++lookupRef.current;
    setDetails(null);
    setResolving(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();
    timerRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      const found = await placeDetails(lat, lng, controller.signal);
      if (lookup !== lookupRef.current) return;
      setDetails(found);
      setResolving(false);
    }, delay);
  }

  // Look up the starting point once, unless add-spot already handed over its
  // address. Pending work is cancelled when the modal closes. A plain
  // useEffect is enough because this modal mounts fresh each time it opens.
  useEffect(() => {
    if (!initialDetails) resolveSoon(initialLat, initialLng, 0);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
      lookupRef.current++;
    };
    // Mount-only: the initial values never change for this screen instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Map tap handler. MapLibre v11 passes a native event whose
   * `nativeEvent.lngLat` is the tapped point in [longitude, latitude] order.
   * Moves the pin and schedules a lookup for it.
   *
   * Gotcha: older MapLibre versions passed a GeoJSON feature
   * (`e.geometry.coordinates`) instead. Reading that shape on v11 finds
   * nothing, so taps were silently ignored. The typed event makes such a
   * mismatch a type error rather than a no-op.
   */
  function handleMapPress(e: NativeSyntheticEvent<PressEvent>) {
    const coords = e.nativeEvent?.lngLat;
    if (!coords) return;
    const [lng, lat] = coords;
    setPoint({ lat, lng });
    resolveSoon(lat, lng);
  }

  /** Hands the pin and its address to add-spot via the Zustand store, then closes the modal. */
  function confirm() {
    if (!details) return;
    setPicked({ lat: point.lat, lng: point.lng, details });
    router.back();
  }

  // Sheet text: the feature's own name if OSM has one, else the address line.
  const placeLine = details ? formatPlaceLine(details) : '';
  const nothingFound = !!details && !details.name && !placeLine;
  const title = !details ? 'Locating…' : nothingFound ? 'No address found here' : (details.name || placeLine);
  // Edit mode's move limit, measured from where the spot was first posted.
  const origin = params.originLat && params.originLng ? { lat: Number(params.originLat), lng: Number(params.originLng) } : null;
  const maxMeters = params.maxMeters ? Number(params.maxMeters) : null;
  const tooFar = !!origin && !!maxMeters && haversineMeters(origin.lat, origin.lng, point.lat, point.lng) > maxMeters;
  const canConfirm = !!details && !resolving && !tooFar;

  // Layout: full-screen map with a pin, a floating back button, and a
  // bottom sheet showing the address, coordinates and the confirm button.
  return (
    <ScreenBackground>
      {/* Hide the native modal header; the map fills the screen. */}
      <Stack.Screen options={{ headerShown: false }} />
      {/* Map. The Camera only sets the initial view, so tapping moves the pin without re-centring the map. */}
      <Map style={styles.map} mapStyle={OPENFREEMAP_STYLE} logo={false} onPress={handleMapPress}>
        <Camera initialViewState={{ center: [point.lng, point.lat], zoom: 12 }} />
        {/* ViewAnnotation renders an ordinary React Native View at a map coordinate; here, the pin dot. */}
        <ViewAnnotation id="picked" lngLat={[point.lng, point.lat]}>
          <View style={styles.pin} />
        </ViewAnnotation>
      </Map>

      {/* Back button floats over the map, offset below the status bar. */}
      <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 12 }]} accessibilityRole="button" accessibilityLabel="Go back">
        <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
      </Pressable>

      {/* Bottom sheet: hint, address (spinner while looking up), coordinates, and confirm. */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.hint}>Tap the map to move the pin. You can rename the place on the next screen.</Text>
        <View style={styles.labelRow}>
          {resolving ? <ActivityIndicator size="small" color={theme.color.gold} /> : <Ionicons name="location" size={16} color={theme.color.gold} />}
          <Text style={styles.labelText}>{title}</Text>
        </View>
        {/* Address line (when it isn't already the title) and exact coordinates, so the pin can be checked. */}
        {details?.name && placeLine ? <Text style={styles.metaText}>{placeLine}</Text> : null}
        <Text style={styles.metaText} selectable accessibilityLabel={spokenCoords(point.lat, point.lng)}>
          {formatDecimalCoords(point.lat, point.lng)}
        </Text>
        {/* Edit mode: the limit, explained before (not only after) going over it. */}
        {maxMeters ? (
          <Text style={[styles.limitText, tooFar && styles.limitTextOver]}>
            Edits can move the pin up to {maxMeters / 1000} km from where it was first posted.
          </Text>
        ) : null}
        <Pressable
          onPress={confirm}
          disabled={!canConfirm}
          accessibilityLabel={tooFar ? `Too far. Edits can move the pin up to ${(maxMeters ?? 0) / 1000} km from where it was first posted.` : undefined}
          style={[styles.confirmBtn, !canConfirm && styles.confirmBtnDisabled]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canConfirm, busy: resolving }}
        >
          <Text style={styles.confirmBtnText} numberOfLines={1}>
            {tooFar ? 'Move closer to the original spot' : canConfirm ? 'Use this location' : 'Finding the address…'}
          </Text>
        </Pressable>
      </View>
    </ScreenBackground>
  );
}

/** "27.50421 degrees north, 92.10372 degrees east", for screen readers. */
function spokenCoords(lat: number, lng: number) {
  return `${Math.abs(lat).toFixed(5)} degrees ${lat >= 0 ? 'north' : 'south'}, ${Math.abs(lng).toFixed(5)} degrees ${lng >= 0 ? 'east' : 'west'}`;
}

// Styles use design tokens (colors, fonts, radii) from constants/theme.ts.
const styles = StyleSheet.create({
  map: { flex: 1 },
  // Map pin and floating back button
  pin: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.color.ember, borderWidth: 3, borderColor: theme.color.cream },
  backBtn: { position: 'absolute', left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: theme.color.photoScrim, alignItems: 'center', justifyContent: 'center' },
  // Bottom sheet
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: theme.color.surface, borderTopWidth: 1, borderTopColor: theme.color.surface2, padding: 20, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg },
  hint: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', marginBottom: 12 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  labelText: { fontFamily: theme.font.body, fontSize: 14, color: theme.color.cream },
  metaText: { fontFamily: theme.font.mono, fontSize: 12, color: theme.color.cream, marginTop: 8, textAlign: 'center' },
  confirmBtn: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, minHeight: 48, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  confirmBtnDisabled: { opacity: 0.5 },
  limitText: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.muted, textAlign: 'center', marginTop: 12 },
  limitTextOver: { color: theme.color.ember },
  confirmBtnText: { fontFamily: theme.font.body, fontSize: 14.5, color: theme.color.dusk },
});
