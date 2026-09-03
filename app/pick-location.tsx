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

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

export default function PickLocation() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ lat?: string; lng?: string }>();
  const setPicked = useLocationPickerStore((s) => s.setPicked);

  const initialLat = params.lat ? Number(params.lat) : 20.5937;
  const initialLng = params.lng ? Number(params.lng) : 78.9629;

  const [point, setPoint] = useState<{ lat: number; lng: number }>({ lat: initialLat, lng: initialLng });
  const [label, setLabel] = useState('Locating...');
  const [resolving, setResolving] = useState(false);

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

  useEffect(() => {
    resolveLabel(point.lat, point.lng);
  }, []);

  function handleMapPress(e: any) {
    const coords = e?.geometry?.coordinates;
    if (!coords) return;
    const [lng, lat] = coords;
    setPoint({ lat, lng });
    resolveLabel(lat, lng);
  }

  function confirm() {
    setPicked({ lat: point.lat, lng: point.lng, label });
    router.back();
  }

  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <Map style={{ flex: 1 }} mapStyle={OPENFREEMAP_STYLE} logo={false} onPress={handleMapPress}>
        <Camera initialViewState={{ center: [point.lng, point.lat], zoom: 12 }} />
        <ViewAnnotation id="picked" lngLat={[point.lng, point.lat]}>
          <View style={styles.pin} />
        </ViewAnnotation>
      </Map>

      <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 10 }]}>
        <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
      </Pressable>

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

const styles = StyleSheet.create({
  pin: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.color.ember, borderWidth: 3, borderColor: theme.color.cream },
  backBtn: { position: 'absolute', left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(20,23,31,0.65)', alignItems: 'center', justifyContent: 'center' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: theme.color.surface, borderTopWidth: 1, borderTopColor: theme.color.surface2, padding: 20, borderTopLeftRadius: theme.radius.lg, borderTopRightRadius: theme.radius.lg },
  hint: { fontFamily: theme.font.bodyRegular, fontSize: 11.5, color: theme.color.muted, textAlign: 'center', marginBottom: 10 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 14 },
  labelText: { fontFamily: theme.font.body, fontSize: 13.5, color: theme.color.cream },
  confirmBtn: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 14, alignItems: 'center' },
  confirmBtnText: { fontFamily: theme.font.body, fontSize: 14.5, color: theme.color.dusk },
});