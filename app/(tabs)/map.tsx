import { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, Text, Pressable, ActivityIndicator, Alert, Image, ScrollView } from 'react-native';
import { Map, Camera, ViewAnnotation } from '@maplibre/maplibre-react-native';
import { useFocusEffect, useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthProvider';
import { ImageViewer } from '@/components/ImageViewer';
import { useUserLocation } from '@/hooks/useUserLocation';
import { clusterSpots } from '@/lib/clusterSpots';
import { ScreenBackground } from '@/components/ScreenBackground';

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

type Spot = {
  id: string; title: string; genre: string | null; lng: number; lat: number;
  description: string | null; best_time: string | null; photo_url: string | null;
  time_of_day: string | null; created_by: string | null; location_label: string | null;
};

export default function MapScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ focusLat?: string; focusLng?: string }>();
  const { session } = useAuth();
  const { refresh } = useUserLocation();
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCluster, setSelectedCluster] = useState<Spot[] | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [deselectNonce, setDeselectNonce] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);

  const clusters = useMemo(() => clusterSpots(spots), [spots]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const loc = await refresh();
        if (!loc) { setLoading(false); return; }
        setCoords(loc);
        const { data, error } = await supabase.rpc('nearby_spots', { lat: loc.lat, long: loc.lng, radius_km: 30 });
        if (!error && data) setSpots(data as Spot[]);
        setLoading(false);
      })();
    }, [])
  );

  function closeCard() {
    setSelectedCluster(null);
    setFocusedIndex(0);
    setDeselectNonce((n) => n + 1);
  }

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

  if (loading) {
    return <ScreenBackground><View style={styles.center}><ActivityIndicator color={theme.color.gold} /></View></ScreenBackground>;
  }
  if (!coords) {
    return <ScreenBackground><View style={styles.center}><Text style={styles.fallbackText}>Location permission is needed to show the map.</Text></View></ScreenBackground>;
  }

  const focusCenter: [number, number] = params.focusLat && params.focusLng
    ? [Number(params.focusLng), Number(params.focusLat)]
    : [coords.lng, coords.lat];
  const selected = selectedCluster ? selectedCluster[focusedIndex] : null;

  return (
    <ScreenBackground>
    <View style={styles.container}>
      <Map style={styles.map} mapStyle={OPENFREEMAP_STYLE} logo={false}>
        <Camera initialViewState={{ center: focusCenter, zoom: params.focusLat ? 14 : 12 }} />
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

          <Text style={styles.cardTitle}>{selected.title}</Text>
          {selected.location_label && <Text style={styles.cardLocation}>📍 {selected.location_label}</Text>}
          <View style={styles.cardMetaRow}>
            {selected.genre && <Text style={styles.cardGenre}>{selected.genre}</Text>}
            {selected.time_of_day && <Text style={styles.cardBestTime}>· {selected.time_of_day}</Text>}
            {selected.best_time && <Text style={styles.cardBestTime}>· {selected.best_time}</Text>}
          </View>
          {selected.description && <Text style={styles.cardDescription}>{selected.description}</Text>}

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

      <ImageViewer visible={viewerVisible} uri={selected?.photo_url} onClose={() => setViewerVisible(false)} />

      <Pressable style={styles.trailFab} onPress={() => router.push('/trail-generator')}>
        <Ionicons name="sparkles" size={20} color={theme.color.gold} />
      </Pressable>
      <Pressable style={styles.fab} onPress={() => router.push('/add-spot')}>
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  fallbackText: { fontFamily: theme.font.bodyRegular, color: theme.color.muted, textAlign: 'center' },
  pin: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: theme.color.gold, overflow: 'visible', backgroundColor: theme.color.surface, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  pinImage: { width: '100%', height: '100%', borderRadius: 19 },
  pinFallback: { width: '100%', height: '100%', borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  pinBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: theme.color.ember, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, borderWidth: 1.5, borderColor: theme.color.dusk },
  pinBadgeText: { fontFamily: theme.font.body, fontSize: 9, color: theme.color.cream },
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
  trailFab: { position: 'absolute', right: 20, bottom: 172, width: 46, height: 46, borderRadius: 23, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.gold, alignItems: 'center', justifyContent: 'center' },
  fab: { position: 'absolute', right: 20, bottom: 100, width: 52, height: 52, borderRadius: 26, backgroundColor: theme.color.ember, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabText: { color: theme.color.cream, fontSize: 26, fontWeight: '600', marginTop: -2 },
});