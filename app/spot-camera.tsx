import { useRef, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType, type FlashMode } from 'expo-camera';
import * as Location from 'expo-location';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { getCurrentWeather } from '@/lib/weather';
import { reverseGeocode } from '@/lib/geocoding';
import { useSpotCameraStore, type CapturedPhoto } from '@/store/spotCamera';

type GeoData = { lat: number | null; lng: number | null; altitude: number | null; placeName: string | null; weatherTempC: number | null; weatherCondition: string | null };

export default function SpotCamera() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const setCaptured = useSpotCameraStore((s) => s.setCaptured);
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [capturing, setCapturing] = useState(false);
  const [photo, setPhoto] = useState<{ uri: string; base64: string; capturedAt: string } | null>(null);
  const [geo, setGeo] = useState<GeoData | null>(null);
  const [locating, setLocating] = useState(false);

  async function handleCapture() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const result = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.6 });
      if (!result?.base64) return;
      const capturedAt = new Date().toISOString();
      setPhoto({ uri: result.uri, base64: result.base64, capturedAt });
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
    if (lat !== null && lng !== null) {
      const [weather, name] = await Promise.all([getCurrentWeather(lat, lng), reverseGeocode(lat, lng)]);
      if (weather) { weatherTempC = weather.tempC; weatherCondition = weather.condition; }
      placeName = name;
    }
    setGeo({ lat, lng, altitude, placeName, weatherTempC, weatherCondition });
    setLocating(false);
  }

  function retake() {
    setPhoto(null);
    setGeo(null);
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
    if (geo?.placeName) summaryParts.push(`📍 ${geo.placeName}`);
    if (hasCoords) summaryParts.push(`${geo!.lat!.toFixed(4)}, ${geo!.lng!.toFixed(4)}`);
    if (geo?.altitude !== null && geo?.altitude !== undefined) summaryParts.push(`${Math.round(geo.altitude)}m`);
    if (geo?.weatherTempC !== null && geo?.weatherTempC !== undefined) {
      summaryParts.push(`${Math.round(geo.weatherTempC)}°C${geo.weatherCondition ? `, ${geo.weatherCondition}` : ''}`);
    }

    return (
      <View style={styles.root}>
        <Stack.Screen options={{ headerShown: false }} />
        <Image source={{ uri: photo.uri }} style={styles.reviewImage} />
        <View style={[styles.reviewOverlay, { paddingBottom: insets.bottom + 20 }]}>
          {locating ? (
            <View style={styles.geoRow}>
              <ActivityIndicator color={theme.color.gold} size="small" />
              <Text style={styles.geoText}>Detecting location & weather…</Text>
            </View>
          ) : summaryParts.length > 0 ? (
            <Text style={styles.geoText} numberOfLines={2}>{summaryParts.join(' · ')}</Text>
          ) : (
            <Text style={styles.geoText}>No location data captured</Text>
          )}
          <View style={styles.reviewActions}>
            <Pressable style={styles.retakeBtn} onPress={retake}>
              <Ionicons name="refresh" size={18} color={theme.color.cream} />
              <Text style={styles.retakeBtnText}>Retake</Text>
            </Pressable>
            <Pressable style={styles.useBtn} onPress={usePhoto}>
              <Ionicons name="checkmark" size={18} color={theme.color.dusk} />
              <Text style={styles.useBtnText}>Use photo</Text>
            </Pressable>
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
  reviewOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,23,31,0.85)', padding: 20 },
  geoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  geoText: { fontFamily: theme.font.mono, fontSize: 12.5, color: theme.color.cream },
  reviewActions: { flexDirection: 'row', gap: 12, marginTop: 18 },
  retakeBtn: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, paddingVertical: 14 },
  retakeBtnText: { color: theme.color.cream, fontFamily: theme.font.body, fontSize: 14 },
  useBtn: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 14 },
  useBtnText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 14 },
});
