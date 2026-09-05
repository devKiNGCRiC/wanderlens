import { useState, useCallback } from 'react';
import { View, Text, Image, Pressable, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUserLocation } from '@/hooks/useUserLocation';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { useNotifications } from '@/context/NotificationsProvider';
import { supabase } from '@/lib/supabase';
import { PolaroidCard } from '@/components/PolaroidCard';
import { ScreenBackground } from '@/components/ScreenBackground';
import { FilterSheet } from '@/components/FilterSheet';
import { formatTimeAgo } from '@/lib/formatTimeAgo';
import { formatUserType } from '@/lib/formatUserType';

type NearbySpot = { id: string; title: string; best_time: string | null; photo_url: string | null };
type Photographer = { id: string; username: string | null; full_name: string | null; avatar_url: string | null; user_type: string | null; photography_genres: string[] | null };
type FeedPost = {
  id: string; title: string; genre: string | null; photo_url: string | null; created_by: string | null;
  creator_username: string | null; creator_name: string | null; creator_avatar: string | null;
  like_count: number; comment_count: number; created_at: string;
};

function handle(p: { creator_username?: string | null; creator_name?: string | null } | { username?: string | null; full_name?: string | null }) {
  return (p as any).creator_username || (p as any).username || (p as any).creator_name || (p as any).full_name || 'traveler';
}

export default function FeedScreen() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const firstName = profile?.username || profile?.full_name?.split(' ')[0] || 'there';
  const { refresh: refreshLocation } = useUserLocation();
  const { unreadCount } = useNotifications();
  const insets = useSafeAreaInsets();

  const [nearbySpots, setNearbySpots] = useState<NearbySpot[]>([]);
  const [photographers, setPhotographers] = useState<Photographer[]>([]);
  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<string | null>(null);
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [loading, setLoading] = useState(true);

  async function loadFeed(genre: string | null, time: string | null) {
    const { data, error } = await supabase.rpc('feed_spots', { genre_filter: genre, time_filter: time, limit_count: 30 });
    if (!error && data) setFeed(data as FeedPost[]);
  }

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        const tasks: PromiseLike<any>[] = [loadFeed(genreFilter, timeFilter)];
        if (session) {
          tasks.push(
            supabase.from('spot_likes').select('spot_id').eq('user_id', session.user.id)
              .then(({ data }) => setLikedIds(new Set((data ?? []).map((l) => l.spot_id)))),
            supabase.from('saved_spots').select('spot_id').eq('user_id', session.user.id)
              .then(({ data }) => setSavedIds(new Set((data ?? []).map((s) => s.spot_id))))
          );
        }
        const [loc] = await Promise.all([refreshLocation(), ...tasks]);
        if (loc) {
          const [nearbyRes, peopleRes] = await Promise.all([
            supabase.rpc('nearby_spots', { lat: loc.lat, long: loc.lng, radius_km: 30 }),
            supabase.rpc('nearby_photographers', { lat: loc.lat, long: loc.lng, radius_km: 30 }),
          ]);
          if (nearbyRes.data) setNearbySpots((nearbyRes.data as NearbySpot[]).slice(0, 6));
          if (peopleRes.data) setPhotographers(peopleRes.data as Photographer[]);
        }
        setLoading(false);
      })();
    }, [session])
  );

  function applyFilters(genre: string | null, time: string | null) {
    setGenreFilter(genre); setTimeFilter(time); loadFeed(genre, time);
  }

  async function toggleLike(post: FeedPost) {
    if (!session) return;
    const isLiked = likedIds.has(post.id);
    setLikedIds((prev) => { const next = new Set(prev); isLiked ? next.delete(post.id) : next.add(post.id); return next; });
    setFeed((prev) => prev.map((p) => p.id === post.id ? { ...p, like_count: p.like_count + (isLiked ? -1 : 1) } : p));
    if (isLiked) await supabase.from('spot_likes').delete().eq('spot_id', post.id).eq('user_id', session.user.id);
    else await supabase.from('spot_likes').insert({ spot_id: post.id, user_id: session.user.id });
  }

  async function toggleSave(spotId: string) {
    if (!session) return;
    const isSaved = savedIds.has(spotId);
    setSavedIds((prev) => { const next = new Set(prev); isSaved ? next.delete(spotId) : next.add(spotId); return next; });
    if (isSaved) await supabase.from('saved_spots').delete().eq('spot_id', spotId).eq('user_id', session.user.id);
    else await supabase.from('saved_spots').insert({ spot_id: spotId, user_id: session.user.id });
  }

  const activeFilterCount = (genreFilter ? 1 : 0) + (timeFilter ? 1 : 0);

  return (
    <ScreenBackground>
      <FlatList
        data={feed}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 110 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
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
              <View style={styles.heroText}>
                <Text style={styles.eyebrow}>GOLDEN HOUR · SOON</Text>
                <Text style={styles.headline}>Chase the <Text style={styles.headlineBold}>light</Text>,{'\n'}{firstName}.</Text>
                <Text style={styles.tagline}>{nearbySpots.length} spots nearby are catching it right now.</Text>
              </View>
            </View>

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
            {loading && <ActivityIndicator color={theme.color.gold} style={{ marginTop: 20 }} />}
          </View>
        }
        renderItem={({ item }) => {
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
      <FilterSheet visible={filterSheetVisible} onClose={() => setFilterSheetVisible(false)} genre={genreFilter} time={timeFilter} onApply={applyFilters} />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  hero: { height: 320, overflow: 'hidden' },
  sun: { position: 'absolute', top: 64, right: 52, width: 64, height: 64, borderRadius: 32, backgroundColor: theme.color.gold, opacity: 0.9 },
  bellBtn: { position: 'absolute', left: 16, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(20,23,31,0.4)', alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: -2, right: -2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: theme.color.ember, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  bellBadgeText: { fontFamily: theme.font.body, fontSize: 9, color: theme.color.cream },
  heroText: { position: 'absolute', left: 26, right: 26, bottom: 26 },
  eyebrow: { fontFamily: theme.font.mono, fontSize: 11, letterSpacing: 1, color: theme.color.gold, marginBottom: 8 },
  headline: { fontFamily: theme.font.displayItalic, fontSize: 30, lineHeight: 34, color: theme.color.cream },
  headlineBold: { fontFamily: theme.font.display },
  tagline: { marginTop: 10, fontSize: 13, color: 'rgba(246,241,231,0.8)', fontFamily: theme.font.bodyRegular },
  section: { paddingHorizontal: 24, paddingTop: 24 },
  sectionTitle: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  exploreHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: theme.color.surface2, backgroundColor: theme.color.surface, borderRadius: 20, paddingVertical: 7, paddingHorizontal: 13 },
  filterBtnText: { fontFamily: theme.font.body, fontSize: 12.5, color: theme.color.gold },
  filterBadge: { backgroundColor: theme.color.gold, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  filterBadgeText: { fontFamily: theme.font.body, fontSize: 10, color: theme.color.dusk },
  filmstrip: { gap: 14, paddingBottom: 6, marginTop: 12 },
  peopleRow: { gap: 12, paddingBottom: 6, marginTop: 12 },
  personChip: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: 30, paddingVertical: 7, paddingHorizontal: 14, paddingLeft: 7 },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.gold, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontFamily: theme.font.display, fontSize: 13, color: theme.color.dusk },
  personName: { fontFamily: theme.font.body, fontSize: 12.5, color: theme.color.cream },
  personTag: { fontFamily: theme.font.bodyRegular, fontSize: 10.5, color: theme.color.muted, marginTop: 1 },
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
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', padding: 40 },
});