import { useState, useCallback } from 'react';
import { View, Text, Image, Pressable, FlatList, StyleSheet, Alert } from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ScreenBackground } from '@/components/ScreenBackground';
import { formatTimeAgo } from '@/lib/formatTimeAgo';

type TrailStop = { id: string; title: string; photo_url: string | null; genre: string | null; time_of_day: string | null; best_time: string | null; tip: string };
type Trail = { id: string; summary: string | null; genre_filter: string | null; stops: TrailStop[]; created_at: string };

export default function MyTrails() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [trails, setTrails] = useState<Trail[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      if (!session) return;
      const { data } = await supabase.from('trails').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
      setTrails((data as Trail[]) ?? []);
    })();
  }, [session]));

  function handleDelete(id: string) {
    Alert.alert('Delete this trail?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('trails').delete().eq('id', id);
          setTrails((prev) => prev.filter((t) => t.id !== id));
        },
      },
    ]);
  }

  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.heading}>My trails</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={trails}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        renderItem={({ item }) => {
          const expanded = expandedId === item.id;
          return (
            <View style={styles.trailCard}>
              <Pressable onPress={() => setExpandedId(expanded ? null : item.id)}>
                <View style={styles.trailHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.trailMeta}>{item.stops.length} STOPS · {item.genre_filter?.toUpperCase() ?? 'ANY GENRE'}</Text>
                    <Text style={styles.trailSummary} numberOfLines={expanded ? undefined : 2}>{item.summary}</Text>
                    <Text style={styles.trailTime}>{formatTimeAgo(item.created_at)}</Text>
                  </View>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={theme.color.muted} />
                </View>
              </Pressable>

              {!expanded && (
                <View style={styles.previewRow}>
                  {item.stops.slice(0, 4).map((s) => (
                    s.photo_url ? <Image key={s.id} source={{ uri: s.photo_url }} style={styles.previewThumb} /> : <View key={s.id} style={[styles.previewThumb, { backgroundColor: theme.color.surface2 }]} />
                  ))}
                </View>
              )}

              {expanded && (
                <View style={{ marginTop: 12 }}>
                  {item.stops.map((stop, i) => (
                    <Pressable key={stop.id} style={styles.stopCard} onPress={() => router.push({ pathname: '/spot/[id]', params: { id: stop.id } })}>
                      <View style={styles.stopNumber}><Text style={styles.stopNumberText}>{i + 1}</Text></View>
                      {stop.photo_url ? <Image source={{ uri: stop.photo_url }} style={styles.stopImage} /> : <View style={[styles.stopImage, { backgroundColor: theme.color.surface2 }]} />}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.stopTitle}>{stop.title}</Text>
                        <Text style={styles.stopMeta}>{[stop.genre, stop.time_of_day, stop.best_time].filter(Boolean).join(' · ')}</Text>
                        <Text style={styles.stopTip}>{stop.tip}</Text>
                      </View>
                    </Pressable>
                  ))}
                  <Pressable onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>Delete trail</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
        ListEmptyComponent={<Text style={styles.emptyText}>No saved trails yet — generate one and tap Save.</Text>}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' },
  heading: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  trailCard: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, padding: 14, marginBottom: 14 },
  trailHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  trailMeta: { fontFamily: theme.font.mono, fontSize: 9.5, letterSpacing: 1, color: theme.color.gold },
  trailSummary: { fontFamily: theme.font.displayItalic, fontSize: 14, color: theme.color.cream, marginTop: 6, lineHeight: 20 },
  trailTime: { fontFamily: theme.font.mono, fontSize: 9, color: theme.color.muted, marginTop: 6 },
  previewRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  previewThumb: { width: 52, height: 52, borderRadius: 8 },
  stopCard: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.color.surface2 },
  stopNumber: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center' },
  stopNumberText: { fontFamily: theme.font.body, fontSize: 11, color: theme.color.dusk },
  stopImage: { width: 48, height: 48, borderRadius: 8 },
  stopTitle: { fontFamily: theme.font.body, fontSize: 13.5, color: theme.color.cream },
  stopMeta: { fontFamily: theme.font.mono, fontSize: 9, color: theme.color.gold, marginTop: 2 },
  stopTip: { fontFamily: theme.font.bodyRegular, fontSize: 11, color: theme.color.muted, marginTop: 3, lineHeight: 15 },
  deleteBtn: { marginTop: 12, alignSelf: 'flex-start' },
  deleteBtnText: { color: theme.color.ember, fontFamily: theme.font.body, fontSize: 12 },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', padding: 40 },
});