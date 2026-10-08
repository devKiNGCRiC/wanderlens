/**
 * Route: / (the (tabs) index), the Feed tab and the app's home screen.
 *
 * Purpose: the first screen a signed-in, onboarded user sees (guard 2 in
 * app/_layout.tsx). A golden-hour hero greets the user, followed by
 * personalised horizontal strips ("Spots near you", "Photographers who've shot nearby")
 * and then a vertical, Instagram-style feed of community spots with like,
 * comment and save actions. A camera FAB opens the geo-tagged spot camera.
 *
 * How it works:
 * - Refreshing feels instant after the first visit: skeletons show only on
 *   the very first load, later focus refreshes run quietly behind the posts
 *   on screen, unchanged posts keep their object identity, and each post is
 *   a memoized FeedPostCard, so liking one re-renders only that card. The
 *   nearby strips (GPS + two RPCs) refresh at most every 2 minutes.
 * - On every focus it reloads, in parallel: the feed (`explore_spots` RPC), the
 *   user's liked and saved spot ids (`spot_likes`, `saved_spots` tables) and
 *   the device location. Once location is known it calls the `nearby_spots`
 *   and `nearby_photographers` RPCs (30 km radius). nearby_photographers
 *   returns people who have POSTED a spot within that radius, closest
 *   first; it doesn't know where users are right now (profiles have no
 *   coordinates), hence the strip's "who've shot nearby" wording.
 * - A Supabase RPC is a Postgres function called with supabase.rpc(); the
 *   project uses RPCs for reads so joined data (creator profile, like and
 *   comment counts) arrives in one round trip instead of N+1 queries.
 * - Likes and saves are optimistic: local state flips immediately, then the
 *   insert/delete is sent to the table.
 * - Genre / time-of-day filters live in FilterSheet; the order (For you,
 *   Recent, Nearby, Most liked, Most discussed) comes from SortChips. Both
 *   feed into `explore_spots` (supabase/migrations/20260940000000_explore_and_likers.sql),
 *   which replaced the untracked legacy `feed_spots` here.
 * - Tapping "N likes" opens /spot-likes/[id], the list of who liked it.
 * - The hero label ("GOLDEN HOUR · 42M") comes from useGoldenHour, which uses
 *   the current coordinates.
 * - The bell opens /notifications and shows an unread badge from
 *   NotificationsProvider.
 *
 * Why useFocusEffect: tab screens stay mounted when you switch tabs, so a
 * plain useEffect would only fetch once; useFocusEffect re-runs each time the
 * tab comes back into view, so likes/saves made elsewhere show up here.
 */
import { useState, useCallback, useRef } from 'react';
import { View, Text, Image, Pressable, FlatList, StyleSheet, Linking, Platform } from 'react-native';
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
import { FeedPostCard, type FeedPost } from '@/components/FeedPostCard';
import { SortChips, sortUsesWindow, type FeedSort, type FeedWindow } from '@/components/SortChips';
import { fetchSpotPhotos, type SpotPhoto } from '@/lib/spotPhotos';
import { formatUserType } from '@/lib/formatUserType';
import { excludeDeletedProfiles, DELETED_ACCOUNT_LABEL } from '@/lib/profiles';
import { FeedPostSkeleton } from '@/components/skeletons/FeedPostSkeleton';

/** One row from the nearby_spots RPC, shown as a polaroid in "Spots near you". */
type NearbySpot = { id: string; title: string; best_time: string | null; photo_url: string | null };
/** One row from the nearby_photographers RPC, shown as a chip in "Photographers who've shot nearby". */
type Photographer = { id: string; username: string | null; full_name: string | null; avatar_url: string | null; user_type: string | null; photography_genres: string[] | null };
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
  const { coords, permissionDenied, refresh: refreshLocation } = useUserLocation();
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
  // Every photo of each feed post, keyed by spot id, for the carousel.
  // Posts missing here (pre-multi-photo spots) fall back to photo_url.
  const [photosBySpot, setPhotosBySpot] = useState<Map<string, SpotPhoto[]>>(new Map());
  // Id of the latest loadFeed call, to drop out-of-order responses.
  const feedRequestRef = useRef(0);
  // True once the first feed has arrived: later focus refreshes run quietly
  // behind the posts already on screen instead of showing skeletons again.
  const hasLoadedRef = useRef(false);
  // When the nearby strips were last refreshed; they change slowly and need
  // GPS, so focus refreshes them at most every STRIPS_REFRESH_MS.
  const stripsLoadedAtRef = useRef(0);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  // Latest liked/saved sets for the stable toggle handlers below.
  const likedIdsRef = useRef(likedIds);
  likedIdsRef.current = likedIds;
  const savedIdsRef = useRef(savedIds);
  savedIdsRef.current = savedIds;
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<string | null>(null);
  // Mirror of the active filters for the focus reload below. That callback
  // is memoised on [session] only, so reading genreFilter/timeFilter state
  // there would see the values from when it was created (the initial nulls)
  // and reload the unfiltered feed while the badge still showed filters.
  // A ref always holds the latest value without re-creating the callback.
  const filtersRef = useRef<{ genre: string | null; time: string | null }>({ genre: null, time: null });
  // Explore ordering (SortChips). Recent is the default, matching the old
  // feed. Mirrored in a ref for the same stale-closure reason as filtersRef.
  const [sort, setSort] = useState<FeedSort>('recent');
  const [sortWindow, setSortWindow] = useState<FeedWindow>('week');
  const sortRef = useRef<{ sort: FeedSort; window: FeedWindow }>({ sort: 'recent', window: 'week' });
  // Latest known coordinates, readable from the memoised focus callback.
  const coordsRef = useRef(coords);
  coordsRef.current = coords;
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  // Only the Explore list is reloading (a sort/filter change), not the whole screen.
  const [feedLoading, setFeedLoading] = useState(false);
  // The latest Explore request failed: a banner with Retry shows above the list.
  const [feedError, setFeedError] = useState(false);

  /**
   * Fetches up to 30 posts from the explore_spots RPC with the current sort
   * and the given filters (null means "no filter"), then all their photos in
   * one more request, and replaces the feed. On error the current feed is
   * left as-is.
   * @param loc Coordinates for the Nearby sort; ignored by the others.
   */
  async function loadFeed(genre: string | null, time: string | null, loc: { lat: number; lng: number } | null = coordsRef.current): Promise<'ok' | 'stale' | 'error'> {
    // Quick sort/filter changes can resolve out of order (there are two
    // awaits here); only the newest request may replace the feed.
    const request = ++feedRequestRef.current;
    const { sort: s, window: w } = sortRef.current;
    const { data, error } = await supabase.rpc('explore_spots', {
      p_sort: s,
      p_genre: genre,
      p_time: time,
      p_window: sortUsesWindow(s) ? w : 'all',
      p_lat: loc?.lat ?? null,
      p_lng: loc?.lng ?? null,
      p_limit: 30,
    });
    if (request !== feedRequestRef.current) return 'stale';
    if (error || !data) {
      setFeedError(true);
      setFeedLoading(false);
      return 'error';
    }
    const posts = data as FeedPost[];
    const photos = await fetchSpotPhotos(posts.map((p) => p.id));
    if (request !== feedRequestRef.current) return 'stale';
    // Whichever request is newest (a chip tap or a focus reload) clears the
    // Explore skeleton, so it can't be left up by a superseded call.
    setFeedError(false);
    setFeedLoading(false);
    hasLoadedRef.current = true;
    // Keep the previous object for anything that didn't change, so the
    // memoized FeedPostCards for those posts don't re-render on a refresh.
    setPhotosBySpot((prev) => reusePhotos(prev, photos));
    setFeed((prev) => reusePosts(prev, posts));
    return 'ok';
  }

  /**
   * Location for the Nearby sort without ever throwing: refreshLocation can
   * reject (GPS off, timeout), and an unhandled rejection here would leave
   * the skeletons up for good.
   */
  async function safeLocation() {
    try { return await refreshLocation(); } catch { return null; }
  }

  /**
   * Reloads the Explore list after a sort or filter change, with its own
   * skeleton. loadFeed clears the skeleton only for the newest request, so
   * tapping two chips quickly can't show the first chip's results under the
   * second.
   */
  async function reloadExplore() {
    setFeedLoading(true);
    const { genre, time } = filtersRef.current;
    const loc = sortRef.current.sort === 'nearby' ? (await safeLocation()) ?? coordsRef.current : coordsRef.current;
    await loadFeed(genre, time, loc);
  }

  // Reload everything each time the Feed tab gains focus (see file header).
  // useCallback keeps the function identity stable so useFocusEffect only
  // re-subscribes when `session` changes.
  useFocusEffect(
    useCallback(() => {
      // useFocusEffect callbacks can't be async themselves, so the work runs
      // in an immediately-invoked async function.
      (async () => {
        // Skeletons only on the very first load; afterwards the refresh runs
        // behind the posts already showing.
        if (!hasLoadedRef.current) setLoading(true);
        // Batch of independent requests to run concurrently (house pattern,
        // see .claude/rules/react-native.md), starting with the feed itself.
        // Location is requested once and shared: the Nearby sort waits for it,
        // every other sort loads straight away.
        const locPromise = safeLocation();
        const { genre, time } = filtersRef.current;
        const feedTask = sortRef.current.sort === 'nearby' ? locPromise.then((l) => loadFeed(genre, time, l)) : loadFeed(genre, time);
        // Posts appear as soon as they arrive, without waiting for GPS or the
        // nearby strips below.
        feedTask.then(() => setLoading(false));
        const tasks: PromiseLike<any>[] = [feedTask];
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
        const [loc] = await Promise.all([locPromise, ...tasks]);
        // The nearby strips need coordinates, so they only load once location
        // is known. If permission was denied, the strips keep their old data
        // (empty on first load) and are simply not rendered.
        if (loc && Date.now() - stripsLoadedAtRef.current > STRIPS_REFRESH_MS) {
          stripsLoadedAtRef.current = Date.now();
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
   * Called by FilterSheet's Apply button. Stores the new filters (in state
   * for the badge, in filtersRef for later focus reloads) and reloads the
   * feed with them straight away (the values are passed in directly because
   * the state updates above haven't applied yet).
   */
  function applyFilters(genre: string | null, time: string | null) {
    filtersRef.current = { genre, time };
    setGenreFilter(genre); setTimeFilter(time);
    reloadExplore();
  }

  /**
   * Sort chip or time-window change: store it (state for the chips, ref for
   * focus reloads) and reload. Nearby fetches a fresh fix (and shows the
   * permission prompt the first time).
   */
  function applySort(nextSort: FeedSort, nextWindow: FeedWindow) {
    sortRef.current = { sort: nextSort, window: nextWindow };
    setSort(nextSort); setSortWindow(nextWindow);
    reloadExplore();
  }

  /**
   * Likes or unlikes a post optimistically: flips the heart and adjusts the
   * like count in local state first, then writes to the spot_likes table.
   * If the write fails, the same flip is applied again to undo it, so the
   * screen never shows a like that didn't save.
   */
  const toggleLike = useCallback(async (post: FeedPost) => {
    if (!session) return;
    const isLiked = likedIdsRef.current.has(post.id);
    // Flips the heart and count in the given direction. Copy the Set before
    // changing it: React only re-renders when state is replaced with a new
    // object, not mutated in place.
    const apply = (liked: boolean) => {
      setLikedIds((prev) => { const next = new Set(prev); if (liked) next.add(post.id); else next.delete(post.id); return next; });
      setFeed((prev) => prev.map((p) => p.id === post.id ? { ...p, like_count: p.like_count + (liked ? 1 : -1) } : p));
    };
    apply(!isLiked);
    const { error } = isLiked
      ? await supabase.from('spot_likes').delete().eq('spot_id', post.id).eq('user_id', session.user.id)
      : await supabase.from('spot_likes').insert({ spot_id: post.id, user_id: session.user.id });
    // Roll back to the original state if the database rejected the write.
    if (error) apply(isLiked);
  }, [session]);

  /**
   * Saves or unsaves a spot (the bookmark), optimistically, via the
   * saved_spots table. Same pattern as toggleLike, without a count to adjust.
   */
  const toggleSave = useCallback(async (spotId: string) => {
    if (!session) return;
    const isSaved = savedIdsRef.current.has(spotId);
    const apply = (saved: boolean) =>
      setSavedIds((prev) => { const next = new Set(prev); if (saved) next.add(spotId); else next.delete(spotId); return next; });
    apply(!isSaved);
    const { error } = isSaved
      ? await supabase.from('saved_spots').delete().eq('spot_id', spotId).eq('user_id', session.user.id)
      : await supabase.from('saved_spots').insert({ spot_id: spotId, user_id: session.user.id });
    if (error) apply(isSaved);
  }, [session]);

  // Navigation handlers for the cards, stable so React.memo can skip rows.
  const openSpot = useCallback((spotId: string) => router.push({ pathname: '/spot/[id]', params: { id: spotId } }), [router]);
  const openProfile = useCallback((userId: string) => router.push({ pathname: '/user/[id]', params: { id: userId } }), [router]);
  const openLikers = useCallback((spotId: string) => router.push({ pathname: '/spot-likes/[id]', params: { id: spotId } }), [router]);

  const renderPost = useCallback(({ item }: { item: FeedPost }) => (
    <FeedPostCard
      post={item}
      name={item.creator_deleted ? DELETED_ACCOUNT_LABEL : handle(item)}
      photos={photosBySpot.get(item.id)}
      isLiked={likedIds.has(item.id)}
      isSaved={savedIds.has(item.id)}
      onLike={toggleLike}
      onSave={toggleSave}
      onOpenSpot={openSpot}
      onOpenProfile={openProfile}
      onOpenLikers={openLikers}
    />
  ), [photosBySpot, likedIds, savedIds, toggleLike, toggleSave, openSpot, openProfile, openLikers]);

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
        // Each post is a tall photo card: render a few up front, keep a
        // small window around the viewport, and let Android drop off-screen
        // views.
        initialNumToRender={3}
        maxToRenderPerBatch={3}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
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

            {/* "Photographers who've shot nearby": people with a spot posted
                near the user (not people physically near them now), closest
                first. Chips link to public profiles; the tag shows their
                first genre, else their formatted user type. */}
            {photographers.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Photographers who&apos;ve shot nearby</Text>
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
            <SortChips
              sort={sort}
              window={sortWindow}
              onChangeSort={(s) => applySort(s, sortWindow)}
              onChangeWindow={(w) => applySort(sort, w)}
            />
            {/* Error state: the list below may be from an earlier request, so say so and offer Retry. */}
            {feedError && !feedLoading && (
              <View style={styles.feedErrorBox}>
                <Text style={styles.feedErrorText}>Couldn&apos;t load these spots. Check your connection.</Text>
                <Pressable onPress={reloadExplore} style={styles.feedErrorBtn} accessibilityRole="button" accessibilityLabel="Retry loading spots">
                  <Text style={styles.emptyActionText}>Retry</Text>
                </Pressable>
              </View>
            )}
            {/* Loading state: two skeleton posts under the header */}
            {(loading || feedLoading) && (
              <>
                <FeedPostSkeleton />
                <FeedPostSkeleton />
              </>
            )}
          </View>
        }
        renderItem={renderPost}
        ListEmptyComponent={!loading && !feedLoading ? (
          sort === 'nearby' && !coords ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyPrompt}>
                {permissionDenied ? 'Location access is off for Wanderlens. Allow it in Settings to see spots near you.' : 'Turn on location to see spots near you.'}
              </Text>
              {/* Once denied, asking again does nothing, so send the user to Settings instead. */}
              <Pressable
                onPress={() => (permissionDenied ? Linking.openSettings() : applySort('nearby', sortWindow))}
                style={styles.emptyAction}
                accessibilityRole="button"
                accessibilityLabel={permissionDenied ? 'Open Settings' : 'Use my location'}>
                <Text style={styles.emptyActionText}>{permissionDenied ? 'Open Settings' : 'Use my location'}</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.emptyText}>{emptyMessage(sort, sortWindow, activeFilterCount > 0)}</Text>
          )
        ) : null}
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
// How often a focus may refresh the nearby strips (they need GPS and change slowly).
const STRIPS_REFRESH_MS = 2 * 60 * 1000;

/** The new posts, reusing the previous object for any post whose fields are unchanged. */
function reusePosts(prev: FeedPost[], next: FeedPost[]): FeedPost[] {
  const byId = new Map(prev.map((p) => [p.id, p]));
  return next.map((p) => {
    const old = byId.get(p.id);
    return old && (Object.keys(p) as (keyof FeedPost)[]).every((k) => old[k] === p[k]) ? old : p;
  });
}

/** The new photo map, reusing the previous array for any spot whose photos are unchanged. */
function reusePhotos(prev: Map<string, SpotPhoto[]>, next: Map<string, SpotPhoto[]>): Map<string, SpotPhoto[]> {
  const out = new Map<string, SpotPhoto[]>();
  next.forEach((list, id) => {
    const old = prev.get(id);
    const same = old && old.length === list.length && old.every((ph, i) => ph.photo_url === list[i].photo_url);
    out.set(id, same ? old : list);
  });
  return out;
}

/** Empty-state copy for the Explore list, per sort, in the app's voice. */
function emptyMessage(sort: FeedSort, window: FeedWindow, filtered: boolean) {
  if (filtered) return 'No posts match this filter yet. Try a different genre or time of day.';
  const period = window === 'week' ? 'this week' : window === 'month' ? 'this month' : 'yet';
  switch (sort) {
    case 'nearby': return 'No spots within 100 km yet. Be the first to add one.';
    case 'liked': return `Nothing has been liked ${period}. Tap the heart on a spot you love.`;
    case 'discussed': return `No conversations ${period}. Comment on a spot to start one.`;
    case 'for_you': return 'Nothing here yet. Connect with photographers and add your genres to tune this.';
    default: return 'No spots yet. Be the first to share one.';
  }
}

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
  // Empty state and camera FAB
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', padding: 40 },
  emptyBox: { alignItems: 'center', paddingHorizontal: 40, paddingTop: 40, paddingBottom: 24 },
  emptyPrompt: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', marginBottom: 16 },
  emptyAction: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: theme.color.gold, borderRadius: theme.radius.lg, paddingHorizontal: 20 },
  emptyActionText: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.gold },
  feedErrorBox: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginTop: 12, padding: 12, borderRadius: theme.radius.md, backgroundColor: theme.color.surface },
  feedErrorText: { flex: 1, fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.cream },
  feedErrorBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: theme.radius.lg, borderWidth: 1, borderColor: theme.color.gold },
  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 52, height: 52, borderRadius: 26,
    backgroundColor: theme.color.ember, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
});