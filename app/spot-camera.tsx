import { useRef, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, ActivityIndicator, Alert, Switch } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import { StaticMapImageManager } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { getCurrentWeather } from '@/lib/weather';
import { reverseGeocode, formatDMS } from '@/lib/geocoding';
import { saveViewAsImage, saveLocalUriToGallery } from '@/lib/media';
import { useSpotCameraStore, type CapturedPhoto } from '@/store/spotCamera';

type GeoData = { lat: number | null; lng: number | null; altitude: number | null; placeName: string | null; address: string | null; weatherTempC: number | null; weatherCondition: string | null; mapImageUri: string | null };
type Photo = { uri: string; base64: string; width: number; height: number; capturedAt: string };

// Same free OpenFreeMap style already used by the main Map tab (app/(tabs)/map.tsx)
// — the mini-map on the geo-tag card should look like the same map, and it
// costs no API key/billing either way.
const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const MINI_MAP_SIZE = 290;
// Card spans (EXPORT_WIDTH - 2*CARD_MARGIN) / EXPORT_WIDTH of the image —
// 1080 - 2*48 = 984, ~91% — inside the requested 88-96% range.
const CARD_MARGIN = 48;
const CARD_PADDING = 30;

// Fixed export width for the stamped gallery copy — independent of screen
// size, so the saved file's quality doesn't depend on the device's own
// resolution the way a plain view-shot of the live screen would. Not the
// camera sensor's full native resolution either (matching the same
// practical-size precedent as the polaroid export in MessageBubble.tsx),
// but comfortably sharp for a shared/saved photo.
const EXPORT_WIDTH = 1080;

export default function SpotCamera() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setCaptured = useSpotCameraStore((s) => s.setCaptured);
  const cameraRef = useRef<CameraView>(null);
  const stampRef = useRef<View>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [capturing, setCapturing] = useState(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [locating, setLocating] = useState(false);
  const [includeGeoCard, setIncludeGeoCard] = useState(true);
  const [savingToGallery, setSavingToGallery] = useState(false);

  async function handleCapture() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const result = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.6 });
      if (!result?.base64) return;
      const capturedAt = new Date().toISOString();
      setPhoto({ uri: result.uri, base64: result.base64, width: result.width, height: result.height, capturedAt });
      resolveGeoData();
    } finally {
      setCapturing(false);
    }
  }

  // Runs after the photo is already shown on the review screen — location
  // and weather fill in as they resolve rather than blocking the shutter.
  // Both degrade to null on denial/failure; the photo itself never waits.
  async function resolveGeoData() {
    setLocating(true);
    let lat: number | null = null;
    let lng: number | null = null;
    let altitude: number | null = null;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        // GPS altitude is far noisier than lat/lng, and phone GPS chips
        // report it far less reliably — only trust it when the device's own
        // altitudeAccuracy says the error margin is reasonably tight.
        // Otherwise a wildly-off reading (e.g. negative at street level) is
        // worse than just not showing one.
        const ALTITUDE_ACCURACY_THRESHOLD_M = 20;
        if (pos.coords.altitudeAccuracy != null && pos.coords.altitudeAccuracy <= ALTITUDE_ACCURACY_THRESHOLD_M) {
          altitude = pos.coords.altitude ?? null;
        }
      }
    } catch {
      // GPS unavailable — geo fields stay null, capture still succeeds.
    }

    let weatherTempC: number | null = null;
    let weatherCondition: string | null = null;
    let placeName: string | null = null;
    let address: string | null = null;
    let mapImageUri: string | null = null;
    if (lat !== null && lng !== null) {
      const [weather, place, mapImage] = await Promise.all([
        getCurrentWeather(lat, lng),
        reverseGeocode(lat, lng),
        StaticMapImageManager.createImage({
          center: [lng, lat],
          zoom: 15,
          mapStyle: OPENFREEMAP_STYLE,
          width: MINI_MAP_SIZE,
          height: MINI_MAP_SIZE,
          output: 'base64',
          logo: false,
        }).catch(() => null), // best-effort, same as weather/reverse-geocode
      ]);
      if (weather) { weatherTempC = weather.tempC; weatherCondition = weather.condition; }
      placeName = place.name;
      address = place.address;
      mapImageUri = mapImage;
    }
    setGeo({ lat, lng, altitude, placeName, address, weatherTempC, weatherCondition, mapImageUri });
    setLocating(false);
  }

  function retake() {
    setPhoto(null);
    setGeo(null);
  }

  async function handleSaveToGallery() {
    if (!photo) return;
    setSavingToGallery(true);
    try {
      // The stamped card (stampRef) is rendered off-screen, purely for this
      // export — it's never shown live during the review screen itself, per
      // the "should only be seen when the image is downloaded" requirement.
      const ok = includeGeoCard ? await saveViewAsImage(stampRef) : await saveLocalUriToGallery(photo.uri);
      Alert.alert(ok ? 'Saved' : 'Permission needed', ok ? 'Photo saved to your gallery.' : 'Allow photo access to save images.');
    } catch {
      Alert.alert('Could not save', 'Something went wrong saving this photo.');
    } finally {
      setSavingToGallery(false);
    }
  }

  function usePhoto() {
    if (!photo) return;
    const captured: CapturedPhoto = {
      uri: photo.uri,
      base64: photo.base64,
      lat: geo?.lat ?? null,
      lng: geo?.lng ?? null,
      altitude: geo?.altitude ?? null,
      capturedAt: photo.capturedAt,
      placeName: geo?.placeName ?? null,
      address: geo?.address ?? null,
      weatherTempC: geo?.weatherTempC ?? null,
      weatherCondition: geo?.weatherCondition ?? null,
    };
    setCaptured(captured);
    router.back();
  }

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.permissionRoot, { paddingTop: insets.top + 20 }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <Ionicons name="camera-outline" size={40} color={theme.color.gold} />
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionBody}>Allow camera access to take a geo-tagged photo for this spot.</Text>
        <Pressable style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>Allow camera</Text>
        </Pressable>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.cancelLink}>Cancel</Text>
        </Pressable>
      </View>
    );
  }

  if (photo) {
    const summaryParts: string[] = [];
    const hasCoords = geo?.lat !== null && geo?.lat !== undefined && geo?.lng !== null && geo?.lng !== undefined;
    if (hasCoords) summaryParts.push(`${formatDMS(geo!.lat!, 'lat')} ${formatDMS(geo!.lng!, 'lng')}`);
    if (geo?.altitude !== null && geo?.altitude !== undefined) summaryParts.push(`${Math.round(geo.altitude)}m`);
    if (geo?.weatherTempC !== null && geo?.weatherTempC !== undefined) {
      summaryParts.push(`${Math.round(geo.weatherTempC)}°C${geo.weatherCondition ? `, ${geo.weatherCondition}` : ''}`);
    }
    // Headline preference: a specific named feature, then the first segment
    // of the full address (still meaningful on its own), then a plain
    // fallback — never leaves the card saying "Unknown location" when a
    // real address was actually found.
    const headline = geo?.placeName || geo?.address?.split(',')[0]?.trim() || 'Unknown location';
    const exportHeight = photo.height > 0 ? EXPORT_WIDTH * (photo.height / photo.width) : EXPORT_WIDTH;

    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />

        {/* Plain live preview — deliberately never shows the stamped card,
            only a small text summary, so the card is genuinely something
            that "only appears when downloaded," not an always-on overlay. */}
        <Image source={{ uri: photo.uri }} style={styles.reviewImage} />
        <View style={[styles.previewInfo, { paddingBottom: insets.bottom + 12 }]}>
          {locating ? (
            <View style={styles.geoRow}>
              <ActivityIndicator color={theme.color.gold} size="small" />
              <Text style={styles.previewInfoText}>Detecting location & weather…</Text>
            </View>
          ) : summaryParts.length > 0 || geo?.placeName || geo?.address ? (
            <Text style={styles.previewInfoText} numberOfLines={2}>
              📍 {headline}{summaryParts.length ? ' · ' : ''}{summaryParts.join(' · ')}
            </Text>
          ) : (
            <Text style={styles.previewInfoText}>No location data captured</Text>
          )}

          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Include geo-tag card in saved photo</Text>
            <Switch
              value={includeGeoCard}
              onValueChange={setIncludeGeoCard}
              trackColor={{ false: theme.color.surface2, true: theme.color.gold }}
              thumbColor={theme.color.cream}
            />
          </View>

          <View style={styles.reviewActions}>
            <Pressable style={styles.retakeBtn} onPress={retake}>
              <Ionicons name="refresh" size={18} color={theme.color.cream} />
              <Text style={styles.retakeBtnText}>Retake</Text>
            </Pressable>
            <Pressable style={styles.saveGalleryBtn} onPress={handleSaveToGallery} disabled={locating || savingToGallery} accessibilityLabel="Save to gallery">
              {savingToGallery ? <ActivityIndicator color={theme.color.gold} size="small" /> : <Ionicons name="download-outline" size={18} color={theme.color.gold} />}
            </Pressable>
            <Pressable style={styles.useBtn} onPress={usePhoto}>
              <Ionicons name="checkmark" size={18} color={theme.color.dusk} />
              <Text style={styles.useBtnText}>Use photo</Text>
            </Pressable>
          </View>
        </View>

        {/* Off-screen only — this is the actual stamped composite that gets
            saved when "Save to gallery" runs with the toggle on. It is never
            rendered on-screen/visible, per the "only seen when downloaded"
            requirement — react-native-view-shot can still capture it. */}
        <View style={styles.offscreen} pointerEvents="none">
          <View ref={stampRef} collapsable={false} style={{ width: EXPORT_WIDTH, height: exportHeight }}>
            <Image source={{ uri: photo.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            {/* Viewfinder corner brackets — this app's own signature focus-
                bracket motif (see components/ used elsewhere), not a generic
                geotag-app look. */}
            {(['TL', 'TR', 'BL', 'BR'] as const).map((corner) => (
              <View key={corner} style={[styles.corner, styles[`corner${corner}`]]} />
            ))}
            <View style={styles.geoCardWrap}>
              <View style={styles.geoCard}>
                <View style={styles.cardTopRow}>
                  <View style={styles.miniMap}>
                    {geo?.mapImageUri ? (
                      <>
                        <Image source={{ uri: geo.mapImageUri }} style={StyleSheet.absoluteFill} />
                        <View style={styles.miniMapPin}>
                          <Ionicons name="location" size={34} color={theme.color.ember} />
                        </View>
                      </>
                    ) : (
                      <View style={styles.miniMapFallback}>
                        <Ionicons name="map-outline" size={36} color={theme.color.gold} />
                      </View>
                    )}
                    <View style={styles.miniMapBorder} pointerEvents="none" />
                  </View>
                  <View style={styles.cardTextCol}>
                    <View style={styles.cardBrandRow}>
                      <Ionicons name="location" size={22} color={theme.color.gold} />
                      <Text style={styles.cardBrand}>WANDERLENS</Text>
                    </View>
                    <Text style={styles.cardPlace} numberOfLines={2}>{headline}</Text>
                    {geo?.address && <Text style={styles.cardAddress} numberOfLines={2}>{geo.address}</Text>}
                    <View style={styles.cardDivider} />
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {hasCoords ? `${formatDMS(geo!.lat!, 'lat')}  ${formatDMS(geo!.lng!, 'lng')}` : 'No GPS fix'}
                    </Text>
                    {(geo?.altitude != null || geo?.weatherTempC != null) && (
                      <Text style={styles.cardMeta} numberOfLines={1}>
                        {geo?.altitude != null ? `ALT ${Math.round(geo.altitude)}m` : ''}
                        {geo?.altitude != null && geo?.weatherTempC != null ? '  ·  ' : ''}
                        {geo?.weatherTempC != null ? `${Math.round(geo.weatherTempC)}°C${geo.weatherCondition ? ` ${geo.weatherCondition}` : ''}` : ''}
                      </Text>
                    )}
                    <Text style={styles.cardMetaSmall} numberOfLines={1}>{new Date(photo.capturedAt).toLocaleString()}</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} flash={flash} />
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Cancel">
          <Ionicons name="close" size={24} color={theme.color.cream} />
        </Pressable>
        <Pressable onPress={() => setFlash((f) => (f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off'))} style={styles.iconBtn} accessibilityLabel="Toggle flash">
          <Ionicons name={flash === 'off' ? 'flash-off' : flash === 'on' ? 'flash' : 'flash-outline'} size={22} color={theme.color.cream} />
        </Pressable>
      </View>
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 24 }]}>
        <View style={{ width: 44 }} />
        <Pressable onPress={handleCapture} style={styles.shutterBtn} disabled={capturing} accessibilityLabel="Take photo">
          {capturing ? <ActivityIndicator color={theme.color.dusk} /> : <View style={styles.shutterInner} />}
        </Pressable>
        <Pressable onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))} style={styles.iconBtn} accessibilityLabel="Flip camera">
          <Ionicons name="camera-reverse-outline" size={26} color={theme.color.cream} />
        </Pressable>
      </View>
    </View>
  );
}

const CORNER_SIZE = 26;
const CORNER_INSET = 18;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.dusk },
  permissionRoot: { alignItems: 'center', padding: 24 },
  permissionTitle: { fontFamily: theme.font.display, fontSize: 20, color: theme.color.cream, marginTop: 16 },
  permissionBody: { fontFamily: theme.font.bodyRegular, fontSize: 14, color: theme.color.muted, textAlign: 'center', marginTop: 10 },
  permissionBtn: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, paddingHorizontal: 32, marginTop: 28 },
  permissionBtnText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
  cancelLink: { color: theme.color.muted, fontFamily: theme.font.bodyRegular, fontSize: 13, marginTop: 18 },
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(20,23,31,0.5)', alignItems: 'center', justifyContent: 'center' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32 },
  shutterBtn: { width: 74, height: 74, borderRadius: 37, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 3, borderColor: theme.color.cream, alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 58, height: 58, borderRadius: 29, backgroundColor: theme.color.cream },

  reviewImage: { flex: 1, width: '100%' },
  previewInfo: { backgroundColor: theme.color.dusk, padding: 20, paddingTop: 16 },
  geoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewInfoText: { fontFamily: theme.font.mono, fontSize: 12.5, color: theme.color.cream },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
  toggleLabel: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, flex: 1, marginRight: 12 },
  reviewActions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  retakeBtn: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, paddingVertical: 14 },
  retakeBtnText: { color: theme.color.cream, fontFamily: theme.font.body, fontSize: 14 },
  saveGalleryBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.color.gold, borderRadius: theme.radius.md },
  useBtn: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 14 },
  useBtnText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 14 },

  // Rendered far off-screen — never visible, only ever captured.
  offscreen: { position: 'absolute', top: -9999, left: 0 },
  corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE, borderColor: theme.color.gold },
  cornerTL: { top: CORNER_INSET, left: CORNER_INSET, borderTopWidth: 4, borderLeftWidth: 4 },
  cornerTR: { top: CORNER_INSET, right: CORNER_INSET, borderTopWidth: 4, borderRightWidth: 4 },
  cornerBL: { bottom: CORNER_INSET, left: CORNER_INSET, borderBottomWidth: 4, borderLeftWidth: 4 },
  cornerBR: { bottom: CORNER_INSET, right: CORNER_INSET, borderBottomWidth: 4, borderRightWidth: 4 },
  geoCardWrap: { position: 'absolute', left: CARD_MARGIN, right: CARD_MARGIN, bottom: CARD_MARGIN },
  geoCard: { backgroundColor: 'rgba(20,23,31,0.94)', borderRadius: 28, borderWidth: 1, borderColor: 'rgba(232,166,76,0.35)', padding: CARD_PADDING },
  cardTopRow: { flexDirection: 'row', alignItems: 'center' },
  miniMap: { width: MINI_MAP_SIZE, height: MINI_MAP_SIZE, borderRadius: 16, overflow: 'hidden', backgroundColor: theme.color.surface2 },
  miniMapFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  miniMapPin: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  miniMapBorder: { ...StyleSheet.absoluteFillObject, borderRadius: 16, borderWidth: 3, borderColor: theme.color.gold },
  cardTextCol: { flex: 1, marginLeft: 28, justifyContent: 'center' },
  cardBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardBrand: { fontFamily: theme.font.mono, fontSize: 21, letterSpacing: 4, color: theme.color.gold },
  cardPlace: { fontFamily: theme.font.display, fontSize: 52, color: theme.color.cream, lineHeight: 58 },
  cardAddress: { fontFamily: theme.font.bodyRegular, fontSize: 22, color: theme.color.cream, opacity: 0.75, marginTop: 8, lineHeight: 29 },
  cardDivider: { height: 3, width: 64, backgroundColor: theme.color.gold, marginTop: 18, marginBottom: 14 },
  cardMeta: { fontFamily: theme.font.mono, fontSize: 23, color: theme.color.cream, opacity: 0.9, marginTop: 7 },
  cardMetaSmall: { fontFamily: theme.font.mono, fontSize: 19, color: theme.color.cream, opacity: 0.6, marginTop: 9 },
});
