/**
 * Route: /spot-likes/[id], "Liked by" for one spot.
 *
 * Purpose: the people who liked a spot, newest like first, the way tapping
 * "12 likes" works on Instagram. Each row opens that person's profile, so
 * this doubles as a way to find photographers to connect with (pillar 2).
 * Opened from the like count in the Feed and on Spot Detail. Registered
 * inside the onboarded `<Stack.Protected>` guard in app/_layout.tsx.
 *
 * How it works:
 * - get_spot_likers RPC (supabase/migrations/20260940000000_explore_and_likers.sql),
 *   paged 50 at a time; more load as the list nears its end.
 * - Deleted accounts and blocked people (either direction) are left out
 *   server-side.
 * - Not a route under spot/[id]/ because app/spot/[id].tsx is a file, not a folder.
 */
import { useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ScreenBackground } from '@/components/ScreenBackground';
import { Avatar } from '@/components/Avatar';
import { formatUserType } from '@/lib/formatUserType';
import { formatTimeAgo } from '@/lib/formatTimeAgo';

/** One row of get_spot_likers. */
type Liker = {
  user_id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  user_type: string | null;
  liked_at: string;
};

const PAGE = 50;

export default function SpotLikesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [likers, setLikers] = useState<Liker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // False once a page comes back short: there's nothing further to fetch.
  const [hasMore, setHasMore] = useState(true);
  // Bumped on every fresh load so a slow page from an earlier load can't
  // append onto a newer list.
  const loadIdRef = useRef(0);
  // Rows the server has handed out so far: the next page's offset. Kept
  // apart from likers.length, which shrinks when duplicates are dropped.
  const serverOffsetRef = useRef(0);
  // Synchronous guard: two onEndReached events in one tick both see the
  // old loadingMore state, so state alone can't stop a double fetch.
  const fetchingMoreRef = useRef(false);
  // The first page has arrived once; later focuses keep the list (and the
  // scroll position) instead of resetting it to page one.
  const loadedRef = useRef(false);

  /** First page, replacing the list. Used on focus and by Retry. */
  const load = useCallback(async () => {
    if (!id) return;
    const loadId = ++loadIdRef.current;
    setLoading(true);
    setLoadError(false);
    const { data, error } = await supabase.rpc('get_spot_likers', { p_spot_id: id, p_limit: PAGE, p_offset: 0 });
    if (loadId !== loadIdRef.current) return;
    if (error) {
      setLoadError(true);
    } else {
      const rows = (data as Liker[]) ?? [];
      serverOffsetRef.current = rows.length;
      loadedRef.current = true;
      setLikers(rows);
      setHasMore(rows.length === PAGE);
    }
    setLoading(false);
  }, [id]);

  // Load on the first focus only: coming back from a profile keeps the list
  // where it was. Retry calls load() directly.
  useFocusEffect(useCallback(() => { if (!loadedRef.current) load(); }, [load]));

  /** Next page, appended. Errors just stop paging; what's shown stays. */
  async function loadMore() {
    if (!id || loading || fetchingMoreRef.current || !hasMore) return;
    fetchingMoreRef.current = true;
    const loadId = loadIdRef.current;
    setLoadingMore(true);
    const { data, error } = await supabase.rpc('get_spot_likers', { p_spot_id: id, p_limit: PAGE, p_offset: serverOffsetRef.current });
    if (loadId === loadIdRef.current) {
      if (error) {
        setHasMore(false);
      } else {
        const rows = (data as Liker[]) ?? [];
        serverOffsetRef.current += rows.length;
        // Skip anyone already listed: a like added meanwhile shifts the offsets.
        setLikers((prev) => [...prev, ...rows.filter((r) => !prev.some((p) => p.user_id === r.user_id))]);
        setHasMore(rows.length === PAGE);
      }
    }
    fetchingMoreRef.current = false;
    setLoadingMore(false);
  }

  const myId = session?.user.id;
  const renderItem = useCallback(({ item }: { item: Liker }) => {
    // My own row goes to the Profile tab; anyone else to their public profile.
    const openProfile = (userId: string) => {
      if (userId === myId) router.push('/(tabs)/profile');
      else router.push({ pathname: '/user/[id]', params: { id: userId } });
    };
    const handle = item.username || item.full_name || 'traveler';
    const role = formatUserType(item.user_type);
    return (
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => openProfile(item.user_id)}
        accessibilityRole="button"
        accessibilityLabel={`${handle}${role ? `, ${role}` : ''}. Open profile`}
      >
        <Avatar uri={item.avatar_url} label={handle} size={44} />
        <View style={styles.rowBody}>
          <Text style={styles.name} numberOfLines={1}>{handle}</Text>
          {role ? <Text style={styles.role} numberOfLines={1}>{role}</Text> : null}
        </View>
        <Text style={styles.time}>{formatTimeAgo(item.liked_at)}</Text>
      </Pressable>
    );
  }, [myId, router]);

  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={4}>
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.heading}>Liked by</Text>
        <View style={styles.topBarSpacer} />
      </View>

      {loading && likers.length === 0 ? (
        <View style={styles.center}><ActivityIndicator color={theme.color.gold} /></View>
      ) : loadError && likers.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Couldn&apos;t load who liked this. Check your connection and try again.</Text>
          <Pressable onPress={load} style={styles.retryBtn} accessibilityRole="button" accessibilityLabel="Retry loading likes">
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={likers}
          keyExtractor={(item) => item.user_id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.color.gold} style={styles.footer} /> : null}
          ListEmptyComponent={<Text style={styles.emptyText}>No likes yet. Be the first to appreciate this spot.</Text>}
        />
      )}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' },
  topBarSpacer: { width: 40 },
  heading: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowPressed: { opacity: 0.7 },
  rowBody: { flex: 1 },
  name: { fontFamily: theme.font.body, fontSize: 14.5, color: theme.color.cream },
  role: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.muted, marginTop: 2 },
  time: { fontFamily: theme.font.mono, fontSize: 12, color: theme.color.muted },
  separator: { height: 1, backgroundColor: theme.color.surface2 },
  footer: { marginVertical: 16 },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', padding: 40 },
  errorText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', marginBottom: 16 },
  retryBtn: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: theme.color.gold, borderRadius: theme.radius.lg, paddingHorizontal: 24 },
  retryText: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.gold },
});
