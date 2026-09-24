/**
 * Route: /my-trails, "My trails" modal.
 *
 * Purpose: lists the AI photo trails the signed-in user has saved from
 * /trail-generator, newest first, and lets them expand a trail to see its
 * stops, open a stop's spot page, or delete the trail. Opened from the
 * "My trails" button on /trail-generator; registered as a modal inside the
 * fully-onboarded `<Stack.Protected>` guard in app/_layout.tsx.
 *
 * How it works:
 * - Reads the user's rows from the `trails` table on every focus. Each row
 *   carries its stops as a JSON snapshot taken when the trail was saved, so
 *   no join against `spots` is needed to render it.
 * - Collapsed cards show up to four stop thumbnails; one card at a time can
 *   be expanded (`expandedId`) to show the full numbered stop list.
 * - Delete asks for confirmation, deletes the row, and removes it from the
 *   list locally without re-fetching.
 *
 * Why useFocusEffect: it re-runs the fetch each time the screen gains focus,
 * so the list is current when returning from another screen.
 */
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

/** One stop inside a saved trail's JSON `stops` value: the spot fields captured at save time, plus the AI tip. */
type TrailStop = { id: string; title: string; photo_url: string | null; genre: string | null; time_of_day: string | null; best_time: string | null; tip: string };
/** One row of the `trails` table, as used by this screen. */
type Trail = { id: string; summary: string | null; genre_filter: string | null; stops: TrailStop[]; created_at: string };

/**
 * The saved-trails screen. Keeps the fetched trails and the id of the
 * currently expanded card in local state.
 */
export default function MyTrails() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [trails, setTrails] = useState<Trail[]>([]);
  // Only one trail is expanded at a time; null means all are collapsed.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch this user's trails, newest first, whenever the screen gains focus.
  // useCallback keeps the callback stable so useFocusEffect only re-subscribes
  // when the session changes. A fetch error is not handled here; the list
  // falls back to empty.
  useFocusEffect(useCallback(() => {
    (async () => {
      if (!session) return;
      const { data } = await supabase.from('trails').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false });
      setTrails((data as Trail[]) ?? []);
    })();
  }, [session]));

  /**
   * Confirms, then deletes a trail. The row is removed from local state
   * after the delete call returns; the call's result is not checked.
   */
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

  // Layout: custom top bar, then a FlatList of trail cards with an empty state.
  return (
    <ScreenBackground>
      {/* Hide the native modal header; this screen draws its own top bar. */}
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.heading}>My trails</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* One card per saved trail, keyed by the trail's id. */}
      <FlatList
        data={trails}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        renderItem={({ item }) => {
          const expanded = expandedId === item.id;
          // Card: tappable header (toggles expand), then either thumbnails or the full stop list.
          return (
            <View style={styles.trailCard}>
              {/* Header: stop count + genre, summary (clamped to 2 lines when collapsed), age, and chevron. */}
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

              {/* Collapsed: thumbnails of the first four stops (a plain tile when a stop has no photo). */}
              {!expanded && (
                <View style={styles.previewRow}>
                  {item.stops.slice(0, 4).map((s) => (
                    s.photo_url ? <Image key={s.id} source={{ uri: s.photo_url }} style={styles.previewThumb} /> : <View key={s.id} style={[styles.previewThumb, { backgroundColor: theme.color.surface2 }]} />
                  ))}
                </View>
              )}

              {/* Expanded: numbered stops (tap opens /spot/[id]) and the delete action. */}
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

// Styles use design tokens (colors, fonts, radii) from constants/theme.ts.
const styles = StyleSheet.create({
  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' },
  heading: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  // Trail card and its header
  trailCard: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, padding: 14, marginBottom: 14 },
  trailHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  trailMeta: { fontFamily: theme.font.mono, fontSize: 9.5, letterSpacing: 1, color: theme.color.gold },
  trailSummary: { fontFamily: theme.font.displayItalic, fontSize: 14, color: theme.color.cream, marginTop: 6, lineHeight: 20 },
  trailTime: { fontFamily: theme.font.mono, fontSize: 9, color: theme.color.muted, marginTop: 6 },
  // Collapsed thumbnails
  previewRow: { flexDirection: 'row', gap: 6, marginTop: 12 },
  previewThumb: { width: 52, height: 52, borderRadius: 8 },
  // Expanded stop rows
  stopCard: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.color.surface2 },
  stopNumber: { width: 22, height: 22, borderRadius: 11, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center' },
  stopNumberText: { fontFamily: theme.font.body, fontSize: 11, color: theme.color.dusk },
  stopImage: { width: 48, height: 48, borderRadius: 8 },
  stopTitle: { fontFamily: theme.font.body, fontSize: 13.5, color: theme.color.cream },
  stopMeta: { fontFamily: theme.font.mono, fontSize: 9, color: theme.color.gold, marginTop: 2 },
  stopTip: { fontFamily: theme.font.bodyRegular, fontSize: 11, color: theme.color.muted, marginTop: 3, lineHeight: 15 },
  // Delete action and empty state
  deleteBtn: { marginTop: 12, alignSelf: 'flex-start' },
  deleteBtnText: { color: theme.color.ember, fontFamily: theme.font.body, fontSize: 12 },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', padding: 40 },
});