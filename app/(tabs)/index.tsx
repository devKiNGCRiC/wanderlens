/**
 * Route: / (the (tabs) index), the Feed tab and the app's home screen.
 *
 * Purpose: the first screen a signed-in, onboarded user sees (guard 2 in
 * app/_layout.tsx). A golden-hour hero greets the user, followed by
 * personalised horizontal strips ("Spots near you", "Photographers nearby")
 * and then a vertical, Instagram-style feed of community spots with like,
 * comment and save actions. A camera FAB opens the geo-tagged spot camera.
 *
 * How it works:
 * - On every focus it reloads, in parallel: the feed (`feed_spots` RPC), the
 *   user's liked and saved spot ids (`spot_likes`, `saved_spots` tables) and
 *   the device location. Once location is known it calls the `nearby_spots`
 *   and `nearby_photographers` RPCs (30 km radius).
 * - A Supabase RPC is a Postgres function called with supabase.rpc(); the
 *   project uses RPCs for reads so joined data (creator profile, like and
 *   comment counts) arrives in one round trip instead of N+1 queries.
 * - Likes and saves are optimistic: local state flips immediately, then the
 *   insert/delete is sent to the table.
 * - Genre / time-of-day filters live in FilterSheet and re-query `feed_spots`.
 * - The hero label ("GOLDEN HOUR · 42M") comes from useGoldenHour, which uses
 *   the current coordinates.
 * - The bell opens /notifications and shows an unread badge from
 *   NotificationsProvider.
 *
 * Why useFocusEffect: tab screens stay mounted when you switch tabs, so a
 * plain useEffect would only fetch once; useFocusEffect re-runs each time the
 * tab comes back into view, so likes/saves made elsewhere show up here.
 */
import { useState, useCallback } from 'react';
import { View, Text, Image, Pressable, FlatList, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUserLocation } from '@/hooks/useUserLocation';
import { useGoldenHour } from '@/hooks/useGoldenHour';
import { useTourTarget } from '@/hooks/useTourTarget';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { useNotifications } from '@/context/NotificationsProvider';
import { supabase } from '@/lib/supabase';
import { PolaroidCard } from '@/components/PolaroidCard';
import { ScreenBackground } from '@/components/ScreenBackground';
import { FilterSheet } from '@/components/FilterSheet';
import { formatTimeAgo } from '@/lib/formatTimeAgo';
import { formatUserType } from '@/lib/formatUserType';
import { excludeDeletedProfiles } from '@/lib/profiles';
import { FeedPostSkeleton } from '@/components/skeletons/FeedPostSkeleton';

/** One row from the nearby_spots RPC, shown as a polaroid in "Spots near you". */
type NearbySpot = { id: string; title: string; best_time: string | null; photo_url: string | null };
/** One row from the nearby_photographers RPC, shown as a chip in "Photographers nearby". */
type Photographer = { id: string; username: string | null; full_name: string | null; avatar_url: string | null; user_type: string | null; photography_genres: string[] | null };
/**
 * One row from the feed_spots RPC: a spot plus its creator's profile fields
 * and aggregate like/comment counts, joined server-side.
 */
type FeedPost = {
  id: string; title: string; genre: string | null; photo_url: string | null; created_by: string | null;
  creator_username: string | null; creator_name: string | null; creator_avatar: string | null;
  like_count: number; comment_count: number; created_at: string;
};

/**
 * Picks the best display name for a person, from either a FeedPost
 * (creator_* fields) or a Photographer (username / full_name).
 * Preference: username, then full name, then the fallback 'traveler'.
 * The `any` casts let one helper read both row shapes.
 */
function handle(p: { creator_username?: string | null; creator_name?: string | null } | { username?: string | null; full_name?: string | null }) {
  return (p as any).creator_username || (p as any).username || (p as any).creator_name || (p as any).full_name || 'traveler';
}

/** Feed tab screen component (default export = the route). */
export default function FeedScreen() {
  const router = useRouter();
  const { session, profile } = useAuth();
  // Name used in the hero greeting ("Chase the light, <name>."). Despite the
  // variable name, the username is preferred over the first name.
  const firstName = profile?.username || profile?.full_name?.split(' ')[0] || 'there';
  // `coords` feeds the golden-hour label; `refreshLocation` asks for
  // permission and returns the current position (or null if denied).
  const { coords, refresh: refreshLocation } = useUserLocation();
  const { unreadCount } = useNotifications();
  const insets = useSafeAreaInsets();
  // Live "GOLDEN HOUR / BLUE HOUR" countdown label for the hero, or null
  // until location and sun times are known.
  const goldenHourLabel = useGoldenHour(coords?.lat ?? null, coords?.lng ?? null);
  // Ref the first-run tour uses to spotlight the camera FAB.
  const cameraFabRef = useTourTarget('feed-camera-fab');

  // Data for the two horizontal strips and the main feed.
  // likedIds / savedIds are Sets of spot ids so each card can check
  // "did I like/save this?" in constant time.
  // genreFilter / timeFilter are the active FilterSheet choices (null = any).
  const [nearbySpots, setNearbySpots] = useState<NearbySpot[]>([]);
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<string | null>(null);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  /**
   * Fetches up to 30 feed posts from the feed_spots RPC with the given
   * filters (null means "no filter") and replaces the feed. On error the
   * current feed is left as-is.
   */
  async function loadFeed(genre: string | null, time: string | null) {
    const { data, error } = await supabase.rpc('feed_spots', { genre_filter: genre, time_filter: time, limit_count: 30 });
    if (!error && data) setFeed(data as FeedPost[]);
  }

  // Reload everything each time the Feed tab gains focus (see file header).
  // useCallback keeps the function identity stable so useFocusEffect only
  // re-subscribes when `session` changes.
  useFocusEffect(
    useCallback(() => {
      // useFocusEffect callbacks can't be async themselves, so the work runs
      // in an immediately-invoked async function.
      (async () => {
        setLoading(true);
        // Batch of independent requests to run concurrently (house pattern,
        // see .claude/rules/react-native.md), starting with the feed itself.
        const tasks: PromiseLike<any>[] = [loadFeed(genreFilter, timeFilter)];
        // The signed-in user's liked and saved spot ids, so the heart and
        // bookmark icons render in the right state.
        if (session) {
          tasks.push(
            supabase.from('spot_likes').select('spot_id').eq('user_id', session.user.id)
              .then(({ data }) => setLikedIds(new Set((data ?? []).map((l) => l.spot_id)))),
            supabase.from('saved_spots').select('spot_id').eq('user_id', session.user.id)
              .then(({ data }) => setSavedIds(new Set((data ?? []).map((s) => s.spot_id))))
          );
        }
        // Location runs alongside the batch; its result is the first element.
        const [loc] = await Promise.all([refreshLocation(), ...tasks]);
        // The nearby strips need coordinates, so they only load once location
        // is known. If permission was denied, the strips keep their old data
        // (empty on first load) and are simply not rendered.
        if (loc) {
          const [nearbyRes, peopleRes] = await Promise.all([
            supabase.rpc('nearby_spots', { lat: loc.lat, long: loc.lng, radius_km: 30 }),
            supabase.rpc('nearby_photographers', { lat: loc.lat, long: loc.lng, radius_km: 30 }),
          ]);
          // Keep the filmstrip short: only the first 6 nearby spots.
          if (nearbyRes.data) setNearbySpots((nearbyRes.data as NearbySpot[]).slice(0, 6));
          // Drop deleted/anonymised accounts; nearby_photographers doesn't
          // filter them itself (see lib/profiles.ts).
          if (peopleRes.data) setPhotographers(await excludeDeletedProfiles(peopleRes.data as Photographer[]));
        }
        setLoading(false);
      })();
    }, [session])
  );

  /**
   * Called by FilterSheet's Apply button. Stores the new filters and
   * reloads the feed with them straight away (the values are passed in
   * directly because the state updates above haven't applied yet).
   */
  function applyFilters(genre: string | null, time: string | null) {
    setGenreFilter(genre); setTimeFilter(time); loadFeed(genre, time);
  }

  /**
   * Likes or unlikes a post optimistically: flips the heart and adjusts the
   * like count in local state first, then writes to the spot_likes table.
   * The write's result is not checked, so a failed request is not rolled back.
   */
  async function toggleLike(post: FeedPost) {
    if (!session) return;
    const isLiked = likedIds.has(post.id);
    // Copy the Set before changing it: React only re-renders when state is
    // replaced with a new object, not mutated in place.
    setLikedIds((prev) => { const next = new Set(prev); isLiked ? next.delete(post.id) : next.add(post.id); return next; });
    setFeed((prev) => prev.map((p) => p.id === post.id ? { ...p, like_count: p.like_count + (isLiked ? -1 : 1) } : p));
    if (isLiked) await supabase.from('spot_likes').delete().eq('spot_id', post.id).eq('user_id', session.user.id);
    else await supabase.from('spot_likes').insert({ spot_id: post.id, user_id: session.user.id });
  }

  /**
   * Saves or unsaves a spot (the bookmark), optimistically, via the
   * saved_spots table. Same pattern as toggleLike, without a count to adjust.
   */
  async function toggleSave(spotId: string) {
    if (!session) return;
    const isSaved = savedIds.has(spotId);
    setSavedIds((prev) => { const next = new Set(prev); isSaved ? next.delete(spotId) : next.add(spotId); return next; });
    if (isSaved) await supabase.from('saved_spots').delete().eq('spot_id', spotId).eq('user_id', session.user.id);
    else await supabase.from('saved_spots').insert({ spot_id: spotId, user_id: session.user.id });
  }

  // Number shown on the Filters button badge (0, 1 or 2 active filters).
  const activeFilterCount = (genreFilter ? 1 : 0) + (timeFilter ? 1 : 0);

  // The whole screen is one vertical FlatList: the hero and horizontal
  // strips are its ListHeaderComponent, so everything scrolls together while
  // the feed rows stay virtualised. ListEmptyComponent (the "no posts"
  // message) only shows once loading has finished, so it doesn't flash
  // underneath the skeletons.
  return (
    <ScreenBackground>
      <FlatList
        data={feed}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            {/* Hero: sunset gradient, a "sun" disc, the bell and photo-styles
                buttons (offset by the top safe-area inset), and the greeting. */}
            <View style={styles.hero}>
              <LinearGradient colors={['#C9683E', '#7A4A5E', '#2E2745', 'transparent']} locations={[0, 0.45, 0.8, 1]} start={{ x: 0.2, y: 0 }} end={{ x: 0.5, y: 1 }} style={StyleSheet.absoluteFill} />
              <View style={styles.sun} />
              <Pressable
                onPress={() => router.push('/notifications')}
                style={[styles.bellBtn, { top: insets.top + 10 }]}
                accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}>
                <Ionicons name="notifications-outline" size={20} color={theme.color.cream} />
                {unreadCount > 0 && (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                onPress={() => router.push('/photo-studio')}
                hitSlop={3}
                style={[styles.styleBtn, { top: insets.top + 10 }]}
                accessibilityLabel="Photo styles">
                <Ionicons name="color-wand-outline" size={20} color={theme.color.cream} />
              </Pressable>
              {/* Greeting. The eyebrow switches to a moon icon and blue color
                  during blue hour, and falls back to a static label until
                  useGoldenHour has a value. */}
              <View style={styles.heroText}>
                <View style={styles.eyebrowRow}>
                  <Ionicons
                    name={goldenHourLabel?.kind === 'blue' ? 'moon' : 'sunny'}
                    size={12}
                    color={goldenHourLabel?.kind === 'blue' ? theme.color.blueHourLight : theme.color.gold}
                  />
                  <Text style={[styles.eyebrow, goldenHourLabel?.kind === 'blue' && styles.eyebrowBlue]}>
                    {goldenHourLabel?.label ?? 'GOLDEN HOUR · BLUE HOUR'}
                  </Text>
                </View>
                <Text style={styles.headline}>Chase the <Text style={styles.headlineBold}>light</Text>,{'\n'}{firstName}.</Text>
                <Text style={styles.tagline}>{nearbySpots.length} spots nearby are catching it right now.</Text>
              </View>
            </View>

            {/* "Spots near you": horizontal filmstrip of polaroids, tilted
                alternately left/right. Hidden when there are none. */}
            {nearbySpots.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Spots near you</Text>
                <FlatList
                  horizontal showsHorizontalScrollIndicator={false} data={nearbySpots} keyExtractor={(i) => i.id}
                  contentContainerStyle={styles.filmstrip}
                  renderItem={({ item, index }) => (
                    <Pressable onPress={() => router.push({ pathname: '/spot/[id]', params: { id: item.id } })}>
                      <PolaroidCard title={item.title} meta={item.best_time || ''} distance="" rotate={index % 2 === 0 ? -3 : 2} photoUrl={item.photo_url} />
                    </Pressable>
                  )}
                />
              </View>
            )}

            {/* "Photographers nearby": chips linking to public profiles. The
                tag shows their first genre, else their formatted user type. */}
            {photographers.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Photographers nearby</Text>
                <FlatList
                  horizontal showsHorizontalScrollIndicator={false} data={photographers} keyExtractor={(i) => i.id}
                  contentContainerStyle={styles.peopleRow}
                  renderItem={({ item }) => (
                    <Pressable style={styles.personChip} onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.id } })}>
                      <View style={styles.avatar}>
                        {item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{handle(item).charAt(0).toUpperCase()}</Text>}
                      </View>
                      <View>
                        <Text style={styles.personName}>{handle(item)}</Text>
                        <Text style={styles.personTag}>{item.photography_genres?.[0] ?? formatUserType(item.user_type) ?? ''}</Text>
                      </View>
                    </Pressable>
                  )}
                />
              </View>
            )}

            {/* "Explore" header with the Filters button and active-filter count */}
            <View style={styles.section}>
              <View style={styles.exploreHeader}>
                <Text style={styles.sectionTitle}>Explore</Text>
                <Pressable onPress={() => setFilterSheetVisible(true)} style={styles.filterBtn}>
                  <Ionicons name="options-outline" size={16} color={theme.color.gold} />
                  <Text style={styles.filterBtnText}>Filters</Text>
                  {activeFilterCount > 0 && <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>{activeFilterCount}</Text></View>}
                </Pressable>
              </View>
            </View>
            {/* Loading state: two skeleton posts under the header */}
            {loading && (
              <>
                <FeedPostSkeleton />
                <FeedPostSkeleton />
              </>
            )}
          </View>
        }
        renderItem={({ item }) => {
          // One feed post: creator header, photo, action row (like, comment,
          // save), then like count, caption, comment link and relative time.
          // Tapping the photo, comment icon or "View all" opens /spot/[id].
          const h = handle(item);
          const isLiked = likedIds.has(item.id);
          const isSaved = savedIds.has(item.id);
          return (
            <View style={styles.postCard}>
              <Pressable style={styles.postHeader} onPress={() => item.created_by && router.push({ pathname: '/user/[id]', params: { id: item.created_by } })}>
                <View style={styles.postAvatar}>
                  {item.creator_avatar ? <Image source={{ uri: item.creator_avatar }} style={styles.postAvatarImage} /> : <Text style={styles.postAvatarText}>{h.charAt(0).toUpperCase()}</Text>}
                </View>
                <Text style={styles.postCreatorName}>{h}</Text>
                {item.genre && <Text style={styles.postGenre}>· {item.genre}</Text>}
              </Pressable>

              <Pressable onPress={() => router.push({ pathname: '/spot/[id]', params: { id: item.id } })}>
                {item.photo_url && <Image source={{ uri: item.photo_url }} style={styles.postImage} />}
              </Pressable>

              <View style={styles.postActionsRow}>
                <View style={styles.postActionsLeft}>
                  <Pressable onPress={() => toggleLike(item)} style={{ marginRight: 16 }}>
                    <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={23} color={isLiked ? theme.color.ember : theme.color.cream} />
                  </Pressable>
                  <Pressable onPress={() => router.push({ pathname: '/spot/[id]', params: { id: item.id } })}>
                    <Ionicons name="chatbubble-outline" size={21} color={theme.color.cream} />
                  </Pressable>
                </View>
                <Pressable onPress={() => toggleSave(item.id)}>
                  <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={21} color={isSaved ? theme.color.gold : theme.color.cream} />
                </Pressable>
              </View>

              <View style={styles.postBody}>
                <Text style={styles.likeCountText}>{item.like_count} likes</Text>
                {!!item.title && (
                  <Text style={styles.captionLine}><Text style={styles.captionUsername}>{h} </Text>{item.title}</Text>
                )}
                {item.comment_count > 0 && (
                  <Pressable onPress={() => router.push({ pathname: '/spot/[id]', params: { id: item.id } })}>
                    <Text style={styles.viewComments}>View all {item.comment_count} comments</Text>
                  </Pressable>
                )}
                <Text style={styles.timeAgo}>{formatTimeAgo(item.created_at)}</Text>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={!loading ? <Text style={styles.emptyText}>No posts match this filter yet.</Text> : null}
      />
      {/* Bottom sheet for choosing genre / time-of-day filters */}
      <FilterSheet visible={filterSheetVisible} onClose={() => setFilterSheetVisible(false)} genre={genreFilter} time={timeFilter} onApply={applyFilters} />

      {/* Camera FAB: opens the spot camera in standalone mode. collapsable
          is false so Android keeps a real native view for the tour to measure. */}
      <Pressable
        ref={cameraFabRef}
        collapsable={false}
        onPress={() => router.push({ pathname: '/spot-camera', params: { standalone: '1' } })}
        style={styles.fab}
        accessibilityLabel="Capture a geo-tagged spot photo"
      >
        <Ionicons name="camera" size={22} color={theme.color.cream} />
      </Pressable>
    </ScreenBackground>
  );
}

// Styles use design tokens (colors, fonts, radii) from constants/theme.ts.
const styles = StyleSheet.create({
  // Hero, bell / photo-styles buttons, greeting
  hero: { height: 320, overflow: 'hidden' },
  sun: { position: 'absolute', top: 64, right: 52, width: 64, height: 64, borderRadius: 32, backgroundColor: theme.color.gold, opacity: 0.9 },
  bellBtn: { position: 'absolute', left: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(20,23,31,0.4)', alignItems: 'center', justifyContent: 'center' },
  styleBtn: { position: 'absolute', right: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(20,23,31,0.4)', alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: theme.color.ember, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  bellBadgeText: { fontFamily: theme.font.body, fontSize: 9, color: theme.color.cream },
  heroText: { position: 'absolute', left: 26, right: 26, bottom: 26 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  eyebrow: { fontFamily: theme.font.mono, fontSize: 11, letterSpacing: 1, color: theme.color.gold },
  eyebrowBlue: { color: theme.color.blueHourLight },
  headline: { fontFamily: theme.font.displayItalic, fontSize: 30, lineHeight: 34, color: theme.color.cream },
  headlineBold: { fontFamily: theme.font.display },
  tagline: { marginTop: 10, fontSize: 13, color: 'rgba(246,241,231,0.8)', fontFamily: theme.font.bodyRegular },
  // Section headers and the Filters button
  section: { paddingHorizontal: 24, paddingTop: 24 },
  sectionTitle: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  exploreHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: theme.color.surface2, backgroundColor: theme.color.surface, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 13 },
  filterBtnText: { fontFamily: theme.font.body, fontSize: 12.5, color: theme.color.gold },
  filterBadge: { backgroundColor: theme.color.gold, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterBadgeText: { fontFamily: theme.font.body, fontSize: 10, color: theme.color.dusk },
  // Horizontal strips: spot filmstrip and photographer chips
  filmstrip: { gap: 14, paddingBottom: 6, marginTop: 12 },
  peopleRow: { gap: 12, paddingBottom: 6, marginTop: 12 },
  personChip: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: 30, paddingVertical: 7, paddingHorizontal: 14, paddingLeft: 7 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.gold, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontFamily: theme.font.display, fontSize: 13, color: theme.color.dusk },
  personName: { fontFamily: theme.font.body, fontSize: 12.5, color: theme.color.cream },
  personTag: { fontFamily: theme.font.bodyRegular, fontSize: 10.5, color: theme.color.muted, marginTop: 1 },
  // Feed post card
  postCard: { marginTop: 24, paddingHorizontal: 20 },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  postAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  postAvatarImage: { width: '100%', height: '100%' },
  postAvatarText: { fontFamily: theme.font.display, fontSize: 12, color: theme.color.dusk },
  postCreatorName: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.cream },
  postGenre: { fontFamily: theme.font.mono, fontSize: 10.5, color: theme.color.gold },
  postImage: { width: '100%', height: 320, borderRadius: theme.radius.md },
  postActionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  postActionsLeft: { flexDirection: 'row', alignItems: 'center' },
  postBody: { marginTop: 6 },
  likeCountText: { fontFamily: theme.font.body, fontSize: 12.5, color: theme.color.cream },
  captionLine: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.cream, marginTop: 4 },
  captionUsername: { fontFamily: theme.font.body },
  viewComments: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.muted, marginTop: 4 },
  timeAgo: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.muted, marginTop: 5, letterSpacing: 0.5 },
  // Empty state and camera FAB
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', padding: 40 },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 52, height: 52, borderRadius: 26,
    backgroundColor: theme.color.ember, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
});