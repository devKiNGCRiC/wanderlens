import { useState } from 'react';
import { View, Text, Pressable, ScrollView, Image, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { generateTrail } from '@/lib/ai';
import { theme } from '@/constants/theme';
import { ScreenBackground } from '@/components/ScreenBackground';
import { useUserLocation } from '@/hooks/useUserLocation';

const GENRES = ['Any', 'Street', 'Landscape', 'Portrait', 'Astro', 'Wildlife', 'Architecture', 'Travel'];

type Spot = { id: string; title: string; genre: string | null; best_time: string | null; time_of_day: string | null; photo_url: string | null; lat: number; lng: number };
type TrailStop = Spot & { tip: string };

export default function TrailGenerator() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { refresh } = useUserLocation();
  const [genre, setGenre] = useState('Any');
  const [stopCount, setStopCount] = useState(4);
  const [loading, setLoading] = useState(false);
  const [trail, setTrail] = useState<{ stops: TrailStop[]; summary: string } | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setTrail(null);
    try {
      const loc = await refresh();
      if (!loc) { Alert.alert('Location needed', 'Enable location to generate a trail.'); return; }

      const { data, error } = await supabase.rpc('nearby_spots', { lat: loc.lat, long: loc.lng, radius_km: 50 });
      if (error || !data || data.length === 0) {
        Alert.alert('Not enough spots yet', 'There are no community spots near you yet to build a trail from.');
        return;
      }
      const spots = data as Spot[];
      const result = await generateTrail(spots, genre === 'Any' ? null : genre, stopCount);
      const stops: TrailStop[] = result.stops
        .map((s) => { const match = spots.find((sp) => sp.id === s.id); return match ? { ...match, tip: s.tip } : null; })
        .filter(Boolean) as TrailStop[];
      setTrail({ stops, summary: result.summary });
    } catch (err: any) {
      Alert.alert('Could not generate trail', err.message ?? 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, paddingBottom: 60 }}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}><Ionicons name="chevron-back" size={20} color={theme.color.cream} /></Pressable>
          <Text style={styles.eyebrow}>AI PHOTO-TRAIL</Text>
        </View>
        <Text style={styles.title}>Build today's trail</Text>
        <Text style={styles.subtitle}>Sequences real spots from your community into one outing.</Text>

        <Text style={styles.label}>Genre focus</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {GENRES.map((g) => (
            <Pressable key={g} onPress={() => setGenre(g)} style={[styles.chip, genre === g && styles.chipSelected]}>
              <Text style={[styles.chipText, genre === g && styles.chipTextSelected]}>{g}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Text style={styles.label}>Number of stops</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[3, 4, 5, 6].map((n) => (
            <Pressable key={n} onPress={() => setStopCount(n)} style={[styles.chip, stopCount === n && styles.chipSelected]}>
              <Text style={[styles.chipText, stopCount === n && styles.chipTextSelected]}>{n}</Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.generateBtn} onPress={handleGenerate} disabled={loading}>
          {loading ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.generateBtnText}>Generate trail</Text>}
        </Pressable>

        {trail && (
          <View style={{ marginTop: 28 }}>
            <Text style={styles.summary}>{trail.summary}</Text>
            {trail.stops.map((stop, i) => (
              <Pressable key={stop.id} style={styles.stopCard} onPress={() => router.push({ pathname: '/spot/[id]', params: { id: stop.id } })}>
                <View style={styles.stopNumber}><Text style={styles.stopNumberText}>{i + 1}</Text></View>
                {stop.photo_url ? <Image source={{ uri: stop.photo_url }} style={styles.stopImage} /> : <View style={styles.stopImageFallback} />}
                <View style={{ flex: 1 }}>
                  <Text style={styles.stopTitle}>{stop.title}</Text>
                  <Text style={styles.stopMeta}>{[stop.genre, stop.time_of_day, stop.best_time].filter(Boolean).join(' · ')}</Text>
                  <Text style={styles.stopTip}>{stop.tip}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  backBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontFamily: theme.font.mono, fontSize: 10.5, letterSpacing: 1.5, color: theme.color.gold },
  title: { fontFamily: theme.font.display, fontSize: 25, color: theme.color.cream, marginTop: 6 },
  subtitle: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, marginTop: 6, marginBottom: 8 },
  label: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, marginTop: 20, marginBottom: 10 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.color.surface2, backgroundColor: theme.color.surface },
  chipSelected: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  chipText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.cream },
  chipTextSelected: { fontFamily: theme.font.body, color: theme.color.dusk },
  generateBtn: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
  generateBtnText: { fontFamily: theme.font.body, fontSize: 15, color: theme.color.dusk },
  summary: { fontFamily: theme.font.displayItalic, fontSize: 15, color: theme.color.cream, marginBottom: 18, lineHeight: 21 },
  stopCard: { flexDirection: 'row', gap: 12, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, padding: 12, marginBottom: 12, alignItems: 'center' },
  stopNumber: { width: 24, height: 24, borderRadius: 12, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center' },
  stopNumberText: { fontFamily: theme.font.body, fontSize: 12, color: theme.color.dusk },
  stopImage: { width: 54, height: 54, borderRadius: 8 },
  stopImageFallback: { width: 54, height: 54, borderRadius: 8, backgroundColor: theme.color.surface2 },
  stopTitle: { fontFamily: theme.font.body, fontSize: 14, color: theme.color.cream },
  stopMeta: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.gold, marginTop: 3 },
  stopTip: { fontFamily: theme.font.bodyRegular, fontSize: 11.5, color: theme.color.muted, marginTop: 4, lineHeight: 16 },
});