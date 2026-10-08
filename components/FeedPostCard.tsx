/**
 * FeedPostCard, one post in the Feed tab's vertical list.
 *
 * Purpose: creator header, the photo carousel, the like / comment / save
 * row, then the like count, caption, comment link and time.
 *
 * Why a separate memoized component: the Feed holds up to 30 posts, and
 * liking or saving one changes screen state. With the row inline in
 * renderItem every visible post re-rendered on each tap; wrapped in
 * React.memo, only the post whose props actually changed does. That needs
 * stable props, so the Feed passes `photos` straight from its map (not a
 * freshly built array) and useCallback handlers that take the post's id.
 */
import { memo, useMemo } from 'react';
import { View, Text, Image, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { PhotoCarousel } from '@/components/PhotoCarousel';
import { formatTimeAgo } from '@/lib/formatTimeAgo';
import type { SpotPhoto } from '@/lib/spotPhotos';

/**
 * One row from the explore_spots RPC: a spot plus its creator's profile
 * fields and aggregate like/comment counts, joined server-side.
 */
export type FeedPost = {
  id: string; title: string; genre: string | null; photo_url: string | null; created_by: string | null;
  creator_username: string | null; creator_name: string | null; creator_avatar: string | null;
  like_count: number; comment_count: number; created_at: string;
  // The creator deleted their account; distance only for the Nearby sort.
  creator_deleted: boolean; distance_m: number | null;
};

type Props = {
  post: FeedPost;
  // Display name for the creator (already "Deleted account" when relevant).
  name: string;
  // The spot's photos from spot_photos; undefined for spots posted before
  // multi-photo, which fall back to photo_url.
  photos: SpotPhoto[] | undefined;
  isLiked: boolean;
  isSaved: boolean;
  onLike: (post: FeedPost) => void;
  onSave: (spotId: string) => void;
  onOpenSpot: (spotId: string) => void;
  onOpenProfile: (userId: string) => void;
  onOpenLikers: (spotId: string) => void;
};

/** "850 m away" / "2.4 km away" for the Nearby sort. */
function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.round(meters)} m away` : `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km away`;
}

function FeedPostCardInner({ post, name, photos, isLiked, isSaved, onLike, onSave, onOpenSpot, onOpenProfile, onOpenLikers }: Props) {
  // Built once per post/photos change, so the carousel's props stay stable too.
  const carouselPhotos = useMemo<SpotPhoto[]>(
    () => (photos && photos.length > 0 ? photos : post.photo_url ? [{ photo_url: post.photo_url, width: null, height: null }] : []),
    [photos, post.photo_url]
  );
  const likes = `${post.like_count} ${post.like_count === 1 ? 'like' : 'likes'}`;

  return (
    <View style={styles.card}>
      <Pressable
        style={styles.header}
        disabled={post.creator_deleted}
        accessibilityRole="button"
        accessibilityState={{ disabled: post.creator_deleted }}
        accessibilityLabel={post.creator_deleted ? name : `${name}. Open profile`}
        onPress={() => post.created_by && onOpenProfile(post.created_by)}>
        <View style={styles.avatar}>
          {post.creator_avatar && !post.creator_deleted
            ? <Image source={{ uri: post.creator_avatar }} style={styles.avatarImage} />
            : <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>}
        </View>
        <Text style={styles.creatorName}>{name}</Text>
        {post.genre && <Text style={styles.genre}>· {post.genre}</Text>}
        {post.distance_m != null && <Text style={styles.distance}>{formatDistance(post.distance_m)}</Text>}
      </Pressable>

      {/* Swipe through a multi-photo post; a tap on any photo opens the spot. */}
      <PhotoCarousel photos={carouselPhotos} height={320} style={styles.image} label={post.title} onPress={() => onOpenSpot(post.id)} />

      {/* Icons sit at their natural spacing; hitSlop grows each tap area to ~44pt without widening the gaps. */}
      <View style={styles.actionsRow}>
        <View style={styles.actionsLeft}>
          <Pressable onPress={() => onLike(post)} hitSlop={11} accessibilityRole="button" accessibilityState={{ selected: isLiked }} accessibilityLabel={isLiked ? 'Unlike' : 'Like'}>
            <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={23} color={isLiked ? theme.color.ember : theme.color.cream} />
          </Pressable>
          <Pressable onPress={() => onOpenSpot(post.id)} hitSlop={11} accessibilityRole="button" accessibilityLabel="Comments">
            <Ionicons name="chatbubble-outline" size={21} color={theme.color.cream} />
          </Pressable>
        </View>
        <Pressable onPress={() => onSave(post.id)} hitSlop={11} accessibilityRole="button" accessibilityState={{ selected: isSaved }} accessibilityLabel={isSaved ? 'Unsave' : 'Save'}>
          <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={21} color={isSaved ? theme.color.gold : theme.color.cream} />
        </Pressable>
      </View>

      <View style={styles.body}>
        {/* Opens "Liked by"; nothing to show at zero. hitSlop instead of a tall box keeps the caption close. */}
        <Pressable
          onPress={() => onOpenLikers(post.id)}
          disabled={post.like_count === 0}
          hitSlop={{ top: 12, bottom: 8, left: 8, right: 16 }}
          style={styles.likeCountBtn}
          accessibilityRole="button"
          accessibilityState={{ disabled: post.like_count === 0 }}
          accessibilityLabel={`${likes}. See who liked this`}>
          <Text style={styles.likeCountText}>{likes}</Text>
        </Pressable>
        {!!post.title && (
          <Text style={styles.captionLine}><Text style={styles.captionUsername}>{name} </Text>{post.title}</Text>
        )}
        {post.comment_count > 0 && (
          <Pressable onPress={() => onOpenSpot(post.id)} hitSlop={{ top: 4, bottom: 8 }}>
            <Text style={styles.viewComments}>View all {post.comment_count} comments</Text>
          </Pressable>
        )}
        <Text style={styles.timeAgo}>{formatTimeAgo(post.created_at)}</Text>
      </View>
    </View>
  );
}

export const FeedPostCard = memo(FeedPostCardInner);

const styles = StyleSheet.create({
  card: { marginTop: 24, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontFamily: theme.font.display, fontSize: 12, color: theme.color.dusk },
  creatorName: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.cream },
  genre: { fontFamily: theme.font.mono, fontSize: 10.5, color: theme.color.gold },
  distance: { fontFamily: theme.font.mono, fontSize: 12, color: theme.color.muted, marginLeft: 'auto' },
  image: { borderRadius: theme.radius.md },
  actionsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  actionsLeft: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  body: { marginTop: 8 },
  likeCountBtn: { alignSelf: 'flex-start' },
  likeCountText: { fontFamily: theme.font.body, fontSize: 12.5, color: theme.color.cream },
  captionLine: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.cream, marginTop: 4 },
  captionUsername: { fontFamily: theme.font.body },
  viewComments: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.muted, marginTop: 4 },
  timeAgo: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.muted, marginTop: 5, letterSpacing: 0.5 },
});
