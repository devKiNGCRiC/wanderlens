/**
 * Route: /map, the Map tab: the crowdsourced photo-spot map.
 *
 * Purpose: shows community spots in the visible map area as photo pins on a
 * MapLibre map (pillar 1 of the app's thesis: real photographers' spots).
 * Tapping a pin opens a card with the photo, genre and timing details, a link
 * to /spot/[id], and a delete button for the spot's creator. Two FABs open
 * the AI trail generator and the add-spot modal. Reachable under guard 2 in
 * app/_layout.tsx.
 *
 * How it works:
 * - Spots are loaded for the area on screen: every time the user finishes
 *   panning or zooming, `nearby_spots` is called around the visible centre,
 *   with a radius that covers the visible area (5-300 km). Before this the
 *   map only ever loaded 30 km around the user's GPS position, so a spot
 *   posted via "Search a place" for another trip never appeared.
 * - On focus: gets the device location, starts at the focus point or the
 *   user, and re-loads the last viewed area so a newly added spot shows up.
 * - Spots a few metres apart are grouped by clusterSpots (lib/clusterSpots.ts)
 *   into one pin with a count badge; the card then pages through that group.
 * - Pins are React views drawn with MapLibre's ViewAnnotation.
 * - Optional `focusLat` / `focusLng` route params (spot detail's "View on
 *   map") centre the camera on a specific point at zoom 14. On first mount
 *   that is the Camera's initialViewState; when the tab is already mounted
 *   the camera flies there.
 * - Deleting a spot writes to the `spots` table directly; RLS on the
 *   database decides whether the delete is actually allowed.
 *
 * Why MapLibre + OpenFreeMap: react-native-maps needs a Google Maps API key
 * and billing account even for non-Google tiles; OpenFreeMap tiles are free
 * (see CLAUDE.md, Stack).
 *
 * Gotchas: ViewAnnotation has a known async-image snapshot-timing quirk
 * (CLAUDE.md, deferred ShapeSource/SymbolLayer rewrite). The `deselectNonce`
 * key trick below is how a pin is made tappable again after closing the card.
 */
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, Text, Pressable, ActivityIndicator, Alert, Image, type NativeSyntheticEvent } from 'react-native';
import { Map, Camera, ViewAnnotation, type CameraRef, type ViewStateChangeEvent } from '@maplibre/maplibre-react-native';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthProvider';
import { ImageViewer } from '@/components/ImageViewer';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useTourTarget } from '@/hooks/useTourTarget';
import { clusterSpots, haversineMeters } from '@/lib/clusterSpots';
import { ScreenBackground } from '@/components/ScreenBackground';

// Free vector map style from OpenFreeMap ("liberty" theme); no API key needed.
const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// Bounds for the spot query radius. The minimum keeps a zoomed-in view from
// asking for a tiny circle; the maximum caps how much a zoomed-out view
// downloads over mobile data.
const MIN_RADIUS_KM = 5;
const MAX_RADIUS_KM = 300;

/** An area to load spots for: a centre point and a radius in km. */
type Region = { lat: number; lng: number; radiusKm: number };

/** One row from the nearby_spots RPC, including coordinates for the pin. */
type Spot = {
  id: string; title: string; genre: string | null; lng: number; lat: number;
  description: string | null; best_time: string | null; photo_url: string | null;
  time_of_day: string | null; created_by: string | null; location_label: string | null;
};

/** Map tab screen component (default export = the route). */
export default function MapScreen() {
  const router = useRouter();
  // Optional deep-link params to centre the map on a given point. Route
  // params always arrive as strings, so they are converted with Number() below.
  const params = useLocalSearchParams<{ focusLat?: string; focusLng?: string }>();
  const { session } = useAuth();
  const { refresh } = useUserLocation();
  // Ref the first-run tour uses to spotlight the AI trail FAB.
  const trailFabRef = useTourTarget('map-trail-fab');
  // coords: the user's position (null = unknown or permission denied).
  // spots: nearby spots from the RPC.
  // selectedCluster / focusedIndex: which pin's group is open in the card,
  // and which spot of that group is shown.
  // deselectNonce: bumped on close to remount the pins (see closeCard).
  // viewerVisible: full-screen photo viewer open or closed.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCluster, setSelectedCluster] = useState<Spot[] | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [deselectNonce, setDeselectNonce] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  // Lets code move the camera (used for "View on map" when the tab is
  // already mounted, where initialViewState no longer applies).
  const cameraRef = useRef<CameraRef>(null);
  // The last area spots were loaded for, so returning to the tab re-loads
  // what the user was looking at rather than jumping back to their GPS area.
  const lastRegionRef = useRef<Region | null>(null);
  // Increments per request so a slow, older response can't overwrite the
  // spots of the area the user has since moved to.
  const requestIdRef = useRef(0);

  // Group nearby spots into pins. useMemo re-runs the clustering only when
  // `spots` changes, not on every render (e.g. when paging the card).
  const clusters = useMemo(() => clusterSpots(spots), [spots]);

  /**
   * Loads the spots for one area through the nearby_spots RPC and remembers
   * the area. Responses from superseded requests are dropped.
   */
  const loadRegion = useCallback(async (region: Region) => {
    lastRegionRef.current = region;
    const requestId = ++requestIdRef.current;
    const { data, error } = await supabase.rpc('nearby_spots', { lat: region.lat, long: region.lng, radius_km: region.radiusKm });
    if (requestId !== requestIdRef.current) return;
    if (!error && data) setSpots(data as Spot[]);
  }, []);

  /**
   * Fires when the user stops panning/zooming (and after the first render).
   * The query radius is the distance from the visible centre to a corner of
   * the screen, so the circle covers everything on screen, clamped to
   * MIN/MAX_RADIUS_KM.
   */
  function handleRegionDidChange(e: NativeSyntheticEvent<ViewStateChangeEvent>) {
    const { center, bounds } = e.nativeEvent;
    if (!center || !bounds) return;
    const [lng, lat] = center;
    const [west, , , north] = bounds;
    const cornerKm = haversineMeters(lat, lng, north, west) / 1000;
    const radiusKm = Math.min(MAX_RADIUS_KM, Math.max(MIN_RADIUS_KM, Math.ceil(cornerKm)));
    loadRegion({ lat, lng, radiusKm });
  }

  // Every time the tab gains focus (useFocusEffect is expo-router's "run when
  // this screen is focused" hook): refresh the user's location, then re-load
  // the last viewed area, so a spot added via the + FAB appears after
  // returning. On the very first visit there is no last area yet, so load
  // around the focus point (if any) or the user.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const loc = await refresh();
        // No location (permission denied): stop loading; the render below
        // then shows the permission message because coords is still null.
        if (!loc) { setLoading(false); return; }
        setCoords(loc);
        await loadRegion(lastRegionRef.current ?? { lat: loc.lat, lng: loc.lng, radiusKm: 30 });
        setLoading(false);
      })();
    }, [refresh, loadRegion])
  );

  // "View on map" from a spot: when focus params arrive while the map is
  // already mounted, fly the camera there. The move triggers
  // handleRegionDidChange, which loads that area's spots.
  const focusLat = params.focusLat ? Number(params.focusLat) : null;
  const focusLng = params.focusLng ? Number(params.focusLng) : null;
  useEffect(() => {
    if (focusLat === null || focusLng === null) return;
    cameraRef.current?.flyTo({ center: [focusLng, focusLat], zoom: 14 });
  }, [focusLat, focusLng]);

  /**
   * Closes the spot card and resets paging. Bumping `deselectNonce` changes
   * every pin's key, which remounts the ViewAnnotations and clears MapLibre's
   * internal "selected" state, so tapping the same pin again fires onSelect.
   */
  function closeCard() {
    setSelectedCluster(null);
    setFocusedIndex(0);
    setDeselectNonce((n) => n + 1);
  }

  /**
   * Asks for confirmation, then deletes the spot from the `spots` table.
   * On success the spot is removed from local state and the card closes;
   * on failure the error is shown in an Alert. Only offered to the creator
   * in the UI; RLS enforces the real permission server-side.
   */
  async function handleDelete(spotId: string) {
    Alert.alert('Delete this spot?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('spots').delete().eq('id', spotId);
          if (error) Alert.alert('Could not delete', error.message);
          else { setSpots((prev) => prev.filter((s) => s.id !== spotId)); closeCard(); }
        },
      },
    ]);
  }

  // Loading and no-permission states replace the whole map.
  if (loading) {
    return <ScreenBackground><View style={styles.center}><ActivityIndicator color={theme.color.gold} /></View></ScreenBackground>;
  }
  if (!coords) {
    return <ScreenBackground><View style={styles.center}><Text style={styles.fallbackText}>Location permission is needed to show the map.</Text></View></ScreenBackground>;
  }

  // Initial camera centre. MapLibre takes coordinates as [longitude,
  // latitude], the reverse of the usual lat/lng order.
  const focusCenter: [number, number] = params.focusLat && params.focusLng
    ? [Number(params.focusLng), Number(params.focusLat)]
    : [coords.lng, coords.lat];
  // The single spot currently shown in the card, or null when no pin is open.
  const selected = selectedCluster ? selectedCluster[focusedIndex] : null;

  return (
    <ScreenBackground>
    <View style={styles.container}>
      <Map style={styles.map} mapStyle={OPENFREEMAP_STYLE} logo={false} onRegionDidChange={handleRegionDidChange}>
        {/* initialViewState only applies when the camera first mounts; later
            moves go through cameraRef (see the focus-params effect). */}
        <Camera ref={cameraRef} initialViewState={{ center: focusCenter, zoom: params.focusLat ? 14 : 12 }} />
        {/* One pin per cluster. The first spot in the group supplies the
            position and thumbnail; a badge shows the group size if > 1. */}
        {clusters.map((cluster) => {
          const primary = cluster[0];
          return (
            <ViewAnnotation
              key={`${primary.id}-${deselectNonce}`}
              id={`${primary.id}-${deselectNonce}`}
              lngLat={[primary.lng, primary.lat]}
              onSelect={() => { setSelectedCluster(cluster); setFocusedIndex(0); }}
            >
              <View style={styles.pin}>
                {primary.photo_url ? (
                  <Image source={{ uri: primary.photo_url }} style={styles.pinImage} />
                ) : (
                  <View style={styles.pinFallback}><Ionicons name="camera" size={16} color={theme.color.gold} /></View>
                )}
                {cluster.length > 1 && (
                  <View style={styles.pinBadge}><Text style={styles.pinBadgeText}>{cluster.length}</Text></View>
                )}
              </View>
            </ViewAnnotation>
          );
        })}
      </Map>

      {/* Spot card for the tapped pin. For a cluster it adds a counter,
          prev/next arrows (wrapping around with %) and a thumbnail strip. */}
      {selected && (
        <View style={styles.card}>
          <Pressable onPress={closeCard} style={styles.cardClose}>
            <Text style={styles.cardCloseText}>✕</Text>
          </Pressable>

          {selectedCluster && selectedCluster.length > 1 && (
            <Text style={styles.clusterCounter}>{focusedIndex + 1} of {selectedCluster.length} posts at this spot</Text>
          )}

          <View style={styles.imageWrap}>
            {selected.photo_url && (
              <Pressable onPress={() => setViewerVisible(true)}>
                <Image source={{ uri: selected.photo_url }} style={styles.cardImage} />
              </Pressable>
            )}
            {selectedCluster && selectedCluster.length > 1 && (
              <>
                <Pressable
                  onPress={() => setFocusedIndex((i) => (i - 1 + selectedCluster.length) % selectedCluster.length)}
                  style={[styles.navArrow, { left: 6 }]}
                >
                  <Ionicons name="chevron-back" size={18} color={theme.color.cream} />
                </Pressable>
                <Pressable
                  onPress={() => setFocusedIndex((i) => (i + 1) % selectedCluster.length)}
                  style={[styles.navArrow, { right: 6 }]}
                >
                  <Ionicons name="chevron-forward" size={18} color={theme.color.cream} />
                </Pressable>
              </>
            )}
          </View>

          {selectedCluster && selectedCluster.length > 1 && (
            <View style={styles.clusterStrip}>
              {selectedCluster.map((s, i) => (
                <Pressable key={s.id} onPress={() => setFocusedIndex(i)} style={[styles.clusterThumbWrap, i === focusedIndex && styles.clusterThumbActive]}>
                  {s.photo_url ? <Image source={{ uri: s.photo_url }} style={styles.clusterThumb} /> : <View style={[styles.clusterThumb, { backgroundColor: theme.color.surface2 }]} />}
                </Pressable>
              ))}
            </View>
          )}

          {/* Spot details */}
          <Text style={styles.cardTitle}>{selected.title}</Text>
          {selected.location_label && <Text style={styles.cardLocation}>📍 {selected.location_label}</Text>}
          <View style={styles.cardMetaRow}>
            {selected.genre && <Text style={styles.cardGenre}>{selected.genre}</Text>}
            {selected.time_of_day && <Text style={styles.cardBestTime}>· {selected.time_of_day}</Text>}
            {selected.best_time && <Text style={styles.cardBestTime}>· {selected.best_time}</Text>}
          </View>
          {selected.description && <Text style={styles.cardDescription}>{selected.description}</Text>}

          {/* Actions: full details for everyone, delete only for the creator */}
          <View style={styles.cardActions}>
            <Pressable onPress={() => router.push({ pathname: '/spot/[id]', params: { id: selected.id } })}>
              <Text style={styles.viewDetailsText}>View full details →</Text>
            </Pressable>
            {selected.created_by === session?.user.id && (
              <Pressable onPress={() => handleDelete(selected.id)}>
                <Text style={styles.deleteBtnText}>Delete spot</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Full-screen viewer for the card photo */}
      <ImageViewer visible={viewerVisible} uri={selected?.photo_url} onClose={() => setViewerVisible(false)} />

      {/* FABs: AI trail generator (sparkles) above, add-spot (+) below */}
      <Pressable ref={trailFabRef} collapsable={false} style={styles.trailFab} onPress={() => router.push('/trail-generator')}>
        <Ionicons name="sparkles" size={20} color={theme.color.gold} />
      </Pressable>
      <Pressable style={styles.fab} onPress={() => router.push('/add-spot')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
    </ScreenBackground>
  );
}

// Styles use design tokens (colors, fonts, radii) from constants/theme.ts.
const styles = StyleSheet.create({
  // Layout and loading / permission fallback
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  fallbackText: { fontFamily: theme.font.bodyRegular, color: theme.color.muted, textAlign: 'center' },
  // Map pins and the cluster count badge
  pin: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: theme.color.gold, overflow: 'visible', backgroundColor: theme.color.surface, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  pinImage: { width: '100%', height: '100%', borderRadius: 19 },
  pinFallback: { width: '100%', height: '100%', borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  pinBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: theme.color.ember, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: theme.color.dusk },
  pinBadgeText: { fontFamily: theme.font.body, fontSize: 9, color: theme.color.cream },
  // Spot card, cluster paging and details
  card: { position: 'absolute', left: 20, right: 20, bottom: 228, backgroundColor: theme.color.surface, borderRadius: theme.radius.md, padding: 16, borderWidth: 1, borderColor: theme.color.surface2, maxHeight: '60%' },
  clusterCounter: { fontFamily: theme.font.mono, fontSize: 10, color: theme.color.gold, marginBottom: 8, textAlign: 'center' },
  imageWrap: { position: 'relative', marginBottom: 10 },
  navArrow: { position: 'absolute', top: '50%', marginTop: -16, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(20,23,31,0.6)', alignItems: 'center', justifyContent: 'center' },
  clusterStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  clusterThumbWrap: { width: 46, height: 46, borderRadius: 8, overflow: 'hidden', opacity: 0.9, borderWidth: 2, borderColor: theme.color.surface2 },
  clusterThumbActive: { opacity: 1, borderColor: theme.color.gold },
  clusterThumb: { width: '100%', height: '100%' },
  cardTitle: { fontFamily: theme.font.display, fontSize: 16, color: theme.color.cream },
  cardLocation: { fontFamily: theme.font.bodyRegular, fontSize: 11.5, color: theme.color.muted, marginTop: 3 },
  cardGenre: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.gold, marginTop: 4 },
  cardClose: { position: 'absolute', top: 10, right: 10, zIndex: 2, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(20,23,31,0.65)', alignItems: 'center', justifyContent: 'center' },
  cardCloseText: { color: theme.color.cream, fontSize: 13 },
  cardImage: { width: '100%', height: 120, borderRadius: theme.radius.sm },
  cardMetaRow: { flexDirection: 'row', marginTop: 4 },
  cardBestTime: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.muted, marginLeft: 6 },
  cardDescription: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.cream, marginTop: 8, lineHeight: 18 },
  cardActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
  viewDetailsText: { color: theme.color.gold, fontFamily: theme.font.body, fontSize: 12.5 },
  deleteBtnText: { color: theme.color.ember, fontFamily: theme.font.body, fontSize: 12.5 },
  // Floating action buttons
  trailFab: { position: 'absolute', right: 20, bottom: 172, width: 46, height: 46, borderRadius: 23, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.gold, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', right: 20, bottom: 100, width: 52, height: 52, borderRadius: 26, backgroundColor: theme.color.ember, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabText: { color: theme.color.cream, fontSize: 26, fontWeight: '600', marginTop: -2 },
});