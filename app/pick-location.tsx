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
 *   without them the map opens on fixed default coordinates.
 * - Tapping the map moves the pin and reverse-geocodes the new point into a
 *   "City, Region, Country" label with expo-location.
 * - "Use this location" writes { lat, lng, label } into the
 *   `useLocationPickerStore` Zustand store and goes back; add-spot reads the
 *   store when it regains focus.
 *
 * Why MapLibre + OpenFreeMap: free tiles with no API key or billing account,
 * unlike react-native-maps with Google (see CLAUDE.md's stack table).
 */
import { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Map, Camera, ViewAnnotation } from '@maplibre/maplibre-react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useLocationPickerStore } from '@/store/locationPicker';
import { ScreenBackground } from '@/components/ScreenBackground';

// OpenFreeMap vector style, the same free tile source used by the other maps in the app.
const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * The tap-to-pin map screen. Keeps the pin position and its label in local
 * state and hands the confirmed choice back through the location-picker store.
 */
export default function PickLocation() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Route params always arrive as strings, so they are converted with Number() below.
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const setPicked = useLocationPickerStore((s) => s.setPicked);

  // Start at the caller's coordinates, or at these fixed default coordinates
  // (20.5937, 78.9629) when none were passed.
  const initialLat = params.lat ? Number(params.lat) : 20.5937;
  const initialLng = params.lng ? Number(params.lng) : 78.9629;

  // Current pin position, its human-readable label, and a flag for the
  // reverse-geocode spinner.
  const [point, setPoint] = useState<{ lat: number; lng: number }>({ lat: initialLat, lng: initialLng });
  const [label, setLabel] = useState('Locating...');
  const [resolving, setResolving] = useState(false);

  /**
   * Reverse-geocodes a point into "City, Region, Country" and stores it as the
   * label. Falls back to the raw coordinates (4 decimal places) when the
   * geocoder returns nothing useful or throws.
   */
  async function resolveLabel(lat: number, lng: number) {
    setResolving(true);
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      const text = [place?.city || place?.subregion, place?.region, place?.country].filter(Boolean).join(', ');
      setLabel(text || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } catch {
      setLabel(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    } finally {
      setResolving(false);
    }
  }

  // Label the starting point once, when the screen mounts. A plain useEffect
  // is enough here because this modal is freshly mounted each time it opens.
  useEffect(() => {
    resolveLabel(point.lat, point.lng);
  }, []);

  /**
   * Map tap handler. MapLibre passes a GeoJSON point feature whose
   * coordinates are in [longitude, latitude] order. Moves the pin and
   * re-resolves the label.
   */
  function handleMapPress(e: any) {
    const coords = e?.geometry?.coordinates;
    if (!coords) return;
    const [lng, lat] = coords;
    setPoint({ lat, lng });
    resolveLabel(lat, lng);
  }

  /** Hands the pin and its current label to add-spot via the Zustand store, then closes the modal. */
  function confirm() {
    setPicked({ lat: point.lat, lng: point.lng, label });
    router.back();
  }

  // Layout: full-screen map with a pin, a floating back button, and a
  // bottom sheet showing the label and the confirm button.
  return (
    <ScreenBackground>
      {/* Hide the native modal header; the map fills the screen. */}
      <Stack.Screen options={{ headerShown: false }} />
      {/* Map. The Camera only sets the initial view, so tapping moves the pin without re-centring the map. */}
      <Map style={{ flex: 1 }} mapStyle={OPENFREEMAP_STYLE} logo={false} onPress={handleMapPress}>
        <Camera initialViewState={{ center: [point.lng, point.lat], zoom: 12 }} />
        {/* ViewAnnotation renders an ordinary React Native View at a map coordinate; here, the pin dot. */}
        <ViewAnnotation id="picked" lngLat={[point.lng, point.lat]}>
          <View style={styles.pin} />
        </ViewAnnotation>
      </Map>

      {/* Back button floats over the map, offset below the status bar. */}
      <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 10 }]}>
        <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
      </Pressable>

      {/* Bottom sheet: hint, resolved label (spinner while geocoding), and confirm. */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.hint}>Tap anywhere on the map to place the pin</Text>
        <View style={styles.labelRow}>
          {resolving ? <ActivityIndicator size="small" color={theme.color.gold} /> : <Ionicons name="location" size={15} color={theme.color.gold} />}
          <Text style={styles.labelText}>{label}</Text>
        </View>
        <Pressable onPress={confirm} style={styles.confirmBtn}>
          <Text style={styles.confirmBtnText}>Use this location</Text>
        </Pressable>
      </View>
    </ScreenBackground>
  );
}

// Styles use design tokens (colors, fonts, radii) from constants/theme.ts.
const styles = StyleSheet.create({
  // Map pin and floating back button
  pin: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.color.ember, borderWidth: 3, borderColor: theme.color.cream },
  backBtn: { position: 'absolute', left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(20,23,31,0.65)', alignItems: 'center', justifyContent: 'center' },
  // Bottom sheet
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: theme.color.surface, borderTopWidth: 1, borderTopColor: theme.color.surface2, padding: 20, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg },
  hint: { fontFamily: theme.font.bodyRegular, fontSize: 11.5, color: theme.color.muted, textAlign: 'center', marginBottom: 10 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 14 },
  labelText: { fontFamily: theme.font.body, fontSize: 13.5, color: theme.color.cream },
  confirmBtn: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 14, alignItems: 'center' },
  confirmBtnText: { fontFamily: theme.font.body, fontSize: 14.5, color: theme.color.dusk },
});