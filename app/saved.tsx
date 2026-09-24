/**
 * Route: /saved, the user's bookmarked spots.
 *
 * Purpose: shows every spot the signed-in user has saved (bookmarked) as a
 * 3-column grid of tilted polaroid cards. Opened from the Profile tab
 * (`router.push('/saved')` in app/(tabs)/profile.tsx). Registered by name in
 * the signed-in-and-onboarded `<Stack.Protected>` block of app/_layout.tsx;
 * the screen hides the header itself below.
 *
 * How it works:
 * - Reads through the `get_saved_spots` Supabase RPC (a Postgres function
 *   called over the API), following the repo rule that reads go through RPCs.
 * - Re-fetches with `useFocusEffect` so a spot saved or unsaved elsewhere is
 *   reflected when the user comes back to this screen.
 * - Tapping a card pushes the spot detail route /spot/[id].
 * - Loading shows a polaroid grid skeleton; empty shows a hint on how to save.
 */
import { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList } from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ScreenBackground } from '@/components/ScreenBackground';
import { PolaroidGridItem, rotationFor } from '@/components/PolaroidGridItem';
import { PolaroidGridSkeleton } from '@/components/skeletons/PolaroidGridSkeleton';

/** One row returned by the `get_saved_spots` RPC: just enough to draw a grid card. */
type SavedSpot = { id: string; title: string; photo_url: string | null; genre: string | null };

/**
 * Saved spots screen. Fetches the current user's saved spots on every focus
 * and renders them in a FlatList grid; each card navigates to /spot/[id].
 */
export default function SavedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  // The saved spots list, and whether the first fetch (or a re-focus fetch)
  // is in flight; `loading` starts true so the skeleton shows immediately.
  const [saved, setSaved] = useState<SavedSpot[]>([]);
  const [loading, setLoading] = useState(true);

  // useFocusEffect runs the callback each time this screen gains focus (not
  // just on mount), so returning from a spot where the user unsaved it shows
  // fresh data. useCallback keeps the effect from re-running on every render.
  // The async IIFE is needed because the effect callback itself can't be async.
  // Note: the RPC `error` is not read; a failure falls through to an empty list.
  useFocusEffect(useCallback(() => {
    (async () => {
      if (!session) return;
      setLoading(true);
      const { data } = await supabase.rpc('get_saved_spots', { uid: session.user.id });
      setSaved((data as SavedSpot[]) ?? []);
      setLoading(false);
    })();
  }, [session]));

  // ScreenBackground is the shared constellation/contour backdrop; the native
  // header is hidden in favour of the custom top bar.
  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Top bar: back button, title, and a 36pt spacer to keep the title centred. */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.heading}>Saved</Text>
        <View style={{ width: 36 }} />
      </View>
      {/* Polaroid grid. rotationFor(index) gives each card a small, stable
          tilt based on its position. While loading, the skeleton renders as
          the list header (the list itself is still empty); the empty message
          only appears once loading is finished. */}
      <FlatList
        data={saved}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={{ padding: 3, paddingBottom: 40 }}
        renderItem={({ item, index }) => (
          <PolaroidGridItem photoUrl={item.photo_url} caption={item.genre} rotate={rotationFor(index)} onPress={() => router.push({ pathname: '/spot/[id]', params: { id: item.id } })} />
        )}
        ListHeaderComponent={loading ? <PolaroidGridSkeleton /> : null}
        ListEmptyComponent={!loading ? <Text style={styles.emptyText}>Nothing saved yet — tap the bookmark icon on any spot to save it here.</Text> : null}
      />
    </ScreenBackground>
  );
}

// Styles use colour, font and radius tokens from constants/theme.ts.
const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' },
  heading: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', padding: 40 },
});