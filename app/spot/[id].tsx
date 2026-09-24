/**
 * Route: /spot/[id], Spot detail screen.
 *
 * Purpose: the full page for one community photo spot, the core unit of
 * Wanderlens' crowdsourced map. Shows the hero photo, creator, title, tags,
 * description, optional live-capture geo tag (coordinates, altitude,
 * weather), like/comment/share/send/save/map actions, the viewer's private
 * notes for this spot, and a threaded (two-level) comment section. Opened
 * from the feed, map, profiles, saved lists and chat spot cards via
 * router.push('/spot/[id]'). This route is not listed by name in
 * app/_layout.tsx; expo-router discovers it from the file system.
 *
 * How it works:
 * - load() reads the spot through the get_spot RPC (a Postgres function the
 *   app calls by name, which returns the spot joined with its creator) plus
 *   a plain spots select for columns get_spot doesn't return.
 * - Like count, whether I liked / saved it, and my notes come from the
 *   spot_likes, saved_spots and notes tables; comments come from the
 *   get_spot_comments RPC (includes like counts and liked_by_me).
 * - Writes (like, save, comment, edit/delete comment, delete spot) go
 *   straight to tables, following the repo's "reads via RPC, writes via
 *   tables" split. After a comment change the screen calls load() again.
 * - Comments arrive as one flat list; groupComments() nests replies under
 *   their top-level parent for rendering.
 *
 * Why:
 * - useFocusEffect re-fetches whenever the screen regains focus, so coming
 *   back from the note editor or a profile shows current data.
 * - The full-screen viewer prefers styled_photo_url (a Photo Styles version
 *   of the image, if one exists) over the original photo.
 *
 * Gotchas:
 * - A reply to a reply is stored with the TOP-LEVEL comment as its parent
 *   (see the reply button on replies), so threads never nest deeper than two.
 * - Only the comment's author can edit it; the author OR the spot's owner
 *   can delete it (enforced in the UI here; RLS is the real boundary).
 */
import { useState, useCallback } from 'react';
import { View, Text, Image, Pressable, ScrollView, TextInput, StyleSheet, Alert, Share, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ImageViewer } from '@/components/ImageViewer';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ActionSheet } from '@/components/ActionSheet';
import { formatTimeAgo } from '@/lib/formatTimeAgo';
import { formatDMS } from '@/lib/geocoding';
import { SpotDetailSkeleton } from '@/components/skeletons/SpotDetailSkeleton';

/** The spot plus creator profile fields, as returned by the get_spot RPC. */
type SpotDetail = {
  id: string; title: string; description: string | null; genre: string | null;
  best_time: string | null; time_of_day: string | null; photo_url: string | null;
  created_by: string | null; lng: number; lat: number; created_at: string;
  creator_username: string | null; creator_name: string | null; creator_avatar: string | null;
};
/**
 * One comment (top-level or reply) from the get_spot_comments RPC, including
 * the author's profile fields and like info for the current user.
 */
type CommentRow = {
  id: string; content: string; user_id: string; parent_comment_id: string | null; created_at: string;
  username: string | null; full_name: string | null; avatar_url: string | null;
  like_count: number; liked_by_me: boolean;
};

/** Display name for a comment author: username, then full name, then "traveler". */
function nameOf(c: { username: string | null; full_name: string | null }) {
  return c.username || c.full_name || 'traveler';
}
/**
 * Turns the flat comment list into top-level comments, each with a `replies`
 * array of the comments whose parent_comment_id points at it.
 */
function groupComments(rows: CommentRow[]) {
  const top = rows.filter((r) => !r.parent_comment_id);
  return top.map((t) => ({ ...t, replies: rows.filter((r) => r.parent_comment_id === t.id) }));
}

/**
 * Spot detail screen component. Loads the spot, social state and comments on
 * focus and renders a skeleton until the spot has arrived.
 */
export default function SpotDetail() {
  // `id` is the spot id from the URL.
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  // The spot itself, its comments, and the viewer's like/save state.
  const [spot, setSpot] = useState<SpotDetail | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  // Comment composer: current text and, if replying, which comment and handle.
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; handle: string } | null>(null);
  // Loading flag and full-screen photo viewer.
  const [loading, setLoading] = useState(true);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [styledPhotoUrl, setStyledPhotoUrl] = useState<string | null>(null);
  // Live-capture metadata (set when the photo was taken in-app with location/weather). All null for ordinary uploads.
  const [geoTag, setGeoTag] = useState<{
    capture_lat: number | null; capture_lng: number | null; capture_altitude: number | null;
    captured_at: string | null; weather_temp_c: number | null; weather_condition: string | null;
    capture_place_name: string | null; capture_address: string | null;
  } | null>(null);
  // The viewer's own notes attached to this spot.
  const [myNotes, setMyNotes] = useState<{ id: string; title: string }[]>([]);
  // Comment being acted on via long-press sheet, and the comment currently being edited inline.
  const [commentActionTarget, setCommentActionTarget] = useState<CommentRow | null>(null);
  const [editingComment, setEditingComment] = useState<{ id: string; text: string } | null>(null);

  /**
   * Fetches everything the screen shows. Called on focus and after comment
   * changes. The first two requests run in parallel; the rest run one after
   * another.
   */
  const load = useCallback(async () => {
    if (!id) return;
    // get_spot is a legacy, untracked RPC — rather than risk changing its
    // return columns blind, styled_photo_url and the geo-tag capture
    // columns are fetched with a plain (RLS-covered, spots are public-read)
    // table select instead.
    const [{ data: spotData }, { data: extraRow }] = await Promise.all([
      supabase.rpc('get_spot', { spot_id: id }).single(),
      supabase.from('spots')
        .select('styled_photo_url, capture_lat, capture_lng, capture_altitude, captured_at, weather_temp_c, weather_condition, capture_place_name, capture_address')
        .eq('id', id).maybeSingle(),
    ]);
    setSpot(spotData as SpotDetail);
    setStyledPhotoUrl(extraRow?.styled_photo_url ?? null);
    setGeoTag(extraRow ?? null);

    // Total like count: a head-only count query, so no rows are downloaded.
    const { count } = await supabase.from('spot_likes').select('*', { count: 'exact', head: true }).eq('spot_id', id);
    setLikeCount(count ?? 0);

    // Per-user state (liked, saved, my notes) only makes sense when signed in.
    if (session) {
      const { data: likeRow } = await supabase.from('spot_likes').select('*').eq('spot_id', id).eq('user_id', session.user.id).maybeSingle();
      setLiked(!!likeRow);
      const { data: savedRow } = await supabase.from('saved_spots').select('*').eq('spot_id', id).eq('user_id', session.user.id).maybeSingle();
      setSaved(!!savedRow);
      const { data: noteRows } = await supabase.from('notes').select('id, title').eq('spot_id', id).eq('user_id', session.user.id).order('created_at', { ascending: false });
      setMyNotes(noteRows ?? []);
    }

    // Comments with author info and like counts, flat; nested later by groupComments().
    const { data: commentData } = await supabase.rpc('get_spot_comments', { spot_id_param: id });
    setComments((commentData as CommentRow[]) ?? []);
    setLoading(false);
  }, [id, session]);

  // Re-load whenever this screen gains focus (expo-router's focus-aware effect).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  /**
   * Likes or unlikes the spot by inserting/deleting the viewer's spot_likes row,
   * then updates the heart and count locally without refetching.
   */
  async function toggleLike() {
    if (!session || !spot) return;
    if (liked) {
      await supabase.from('spot_likes').delete().eq('spot_id', spot.id).eq('user_id', session.user.id);
      setLiked(false); setLikeCount((c) => c - 1);
    } else {
      await supabase.from('spot_likes').insert({ spot_id: spot.id, user_id: session.user.id });
      setLiked(true); setLikeCount((c) => c + 1);
    }
  }

  /** Saves or unsaves the spot for the viewer via the saved_spots table. */
  async function toggleSave() {
    if (!session || !spot) return;
    if (saved) {
      await supabase.from('saved_spots').delete().eq('spot_id', spot.id).eq('user_id', session.user.id);
      setSaved(false);
    } else {
      await supabase.from('saved_spots').insert({ spot_id: spot.id, user_id: session.user.id });
      setSaved(true);
    }
  }

  /**
   * Likes/unlikes a comment. Optimistic: the heart and count update first,
   * then the comment_likes row is inserted or deleted.
   */
  async function toggleCommentLike(comment: CommentRow) {
    if (!session) return;
    const isLiked = comment.liked_by_me;
    setComments((prev) => prev.map((c) => c.id === comment.id ? { ...c, liked_by_me: !isLiked, like_count: c.like_count + (isLiked ? -1 : 1) } : c));
    if (isLiked) await supabase.from('comment_likes').delete().eq('comment_id', comment.id).eq('user_id', session.user.id);
    else await supabase.from('comment_likes').insert({ comment_id: comment.id, user_id: session.user.id });
  }

  /**
   * Posts the composer text as a new comment, or as a reply when replyingTo is
   * set. On success clears the composer and reloads comments.
   */
  async function submitComment() {
    if (!session || !spot || !commentText.trim()) return;
    const { error } = await supabase.from('spot_comments').insert({
      spot_id: spot.id, user_id: session.user.id, content: commentText.trim(), parent_comment_id: replyingTo?.id ?? null,
    });
    if (!error) { setCommentText(''); setReplyingTo(null); load(); }
  }

  /**
   * Opens the long-press action sheet for a comment, but only if the viewer
   * wrote it or owns the spot; otherwise the long-press does nothing.
   */
  function openCommentActions(comment: CommentRow) {
    if (!session) return;
    const isMine = comment.user_id === session.user.id;
    const isSpotOwner = spot?.created_by === session.user.id;
    if (!isMine && !isSpotOwner) return;
    setCommentActionTarget(comment);
  }

  /** Switches a comment into inline edit mode, seeded with its current text. */
  function startEditComment(comment: CommentRow) {
    setEditingComment({ id: comment.id, text: comment.content });
  }

  /** Saves an inline comment edit to spot_comments and reloads on success. */
  async function saveEditComment() {
    if (!editingComment || !editingComment.text.trim()) return;
    const { error } = await supabase.from('spot_comments').update({ content: editingComment.text.trim() }).eq('id', editingComment.id);
    setEditingComment(null);
    if (!error) load();
    else Alert.alert('Could not save', 'Please try again.');
  }

  /** Confirms, then deletes a comment together with its replies, and reloads. */
  function deleteComment(comment: CommentRow) {
    Alert.alert('Delete this comment?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          // Replies aren't guaranteed to cascade-delete with their parent —
          // remove them explicitly first regardless of the live FK config.
          await supabase.from('spot_comments').delete().eq('parent_comment_id', comment.id);
          const { error } = await supabase.from('spot_comments').delete().eq('id', comment.id);
          if (error) Alert.alert('Could not delete', 'Please try again.');
          load();
        },
      },
    ]);
  }

  /** Opens the OS share sheet with the spot title and, if present, its photo URL. */
  function handleShare() {
    if (!spot) return;
    Share.share({ message: `Check out "${spot.title}" on Wanderlens${spot.photo_url ? '\n' + spot.photo_url : ''}` });
  }
  /** Jumps to the Map tab, passing the spot's coordinates so the map can centre on it. */
  function viewOnMap() {
    if (!spot) return;
    router.push({ pathname: '/(tabs)/map', params: { focusLat: String(spot.lat), focusLng: String(spot.lng) } });
  }
  /** Opens another user's public profile (creator or commenter). */
  function goToProfile(userId: string | null) {
    if (userId) router.push({ pathname: '/user/[id]', params: { id: userId } });
  }
  /** Confirms, then deletes the spot (owner only; button shown only to the creator) and goes back. */
  function handleDelete() {
    if (!spot) return;
    Alert.alert('Delete this spot?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.from('spots').delete().eq('id', spot.id); router.back(); } },
    ]);
  }

  // Loading state: the skeleton placeholder until the spot has loaded.
  if (loading || !spot) {
    return (
      <ScreenBackground>
        <Stack.Screen options={{ headerShown: false }} />
        <SpotDetailSkeleton />
      </ScreenBackground>
    );
  }

  // Derived values for rendering: creator display name and the nested comment tree.
  const creatorHandle = spot.creator_username || spot.creator_name || 'traveler';
  const grouped = groupComments(comments);

  // Loaded state. KeyboardAvoidingView lifts the comment input above the
  // on-screen keyboard (padding on iOS, height on Android).
  return (
    <ScreenBackground>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Scrollable content; keyboardShouldPersistTaps lets taps on buttons register while the keyboard is open. */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        {/* Hero photo (tap for full screen) with a floating back button. */}
        <View>
          {spot.photo_url && (
            <Pressable onPress={() => setViewerVisible(true)}>
              <Image source={{ uri: spot.photo_url }} style={styles.heroImage} />
            </Pressable>
          )}
          <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 10 }]}>
            <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
          </Pressable>
        </View>

        <View style={styles.body}>
          {/* Creator row: avatar or initial, tap to open their profile. */}
          <Pressable style={styles.creatorRow} onPress={() => goToProfile(spot.created_by)}>
            <View style={styles.creatorAvatar}>
              {spot.creator_avatar ? <Image source={{ uri: spot.creator_avatar }} style={styles.creatorAvatarImage} /> : <Text style={styles.creatorAvatarText}>{creatorHandle.charAt(0).toUpperCase()}</Text>}
            </View>
            <Text style={styles.creatorName}>{creatorHandle}</Text>
          </Pressable>

          {/* Title, tag chips (genre, time of day, best time), description and age. */}
          <Text style={styles.title}>{spot.title}</Text>
          <View style={styles.metaRow}>
            {spot.genre && <View style={styles.tag}><Text style={styles.tagText}>{spot.genre}</Text></View>}
            {spot.time_of_day && <View style={styles.tag}><Text style={styles.tagText}>{spot.time_of_day}</Text></View>}
            {spot.best_time && <View style={styles.tag}><Text style={styles.tagText}>{spot.best_time}</Text></View>}
          </View>
          {spot.description && <Text style={styles.description}>{spot.description}</Text>}
          <Text style={styles.timeAgo}>{formatTimeAgo(spot.created_at)}</Text>
          {/* Live-capture geo tag: place, coordinates in degrees/minutes/seconds, altitude and weather, shown only when capture coordinates exist. */}
          {geoTag?.capture_lat != null && geoTag?.capture_lng != null && (
            <>
              <Text style={styles.geoTagText}>
                📍 Captured live · {geoTag.capture_place_name ? `${geoTag.capture_place_name} · ` : ''}{formatDMS(geoTag.capture_lat, 'lat')} {formatDMS(geoTag.capture_lng, 'lng')}
                {geoTag.capture_altitude != null ? ` · ${Math.round(geoTag.capture_altitude)}m` : ''}
                {geoTag.weather_temp_c != null ? ` · ${Math.round(geoTag.weather_temp_c)}°C${geoTag.weather_condition ? `, ${geoTag.weather_condition}` : ''}` : ''}
              </Text>
              {geoTag.capture_address && <Text style={styles.geoTagAddress}>{geoTag.capture_address}</Text>}
            </>
          )}

          {/* Action bar: like, comment count, share, send in a chat, save, and view on map. */}
          <View style={styles.actionRow}>
            <Pressable onPress={toggleLike} style={styles.actionBtn}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? theme.color.ember : theme.color.cream} />
              <Text style={styles.actionText}>{likeCount}</Text>
            </Pressable>
            <View style={styles.actionBtn}>
              <Ionicons name="chatbubble-outline" size={20} color={theme.color.cream} />
              <Text style={styles.actionText}>{comments.length}</Text>
            </View>
            <Pressable onPress={handleShare} style={styles.actionBtn}>
              <Ionicons name="share-outline" size={20} color={theme.color.cream} />
            </Pressable>
            <Pressable onPress={() => router.push({ pathname: '/new-message', params: { shareSpotId: spot.id } })} style={styles.actionBtn}>
              <Ionicons name="paper-plane-outline" size={19} color={theme.color.cream} />
            </Pressable>
            <Pressable onPress={toggleSave} style={styles.actionBtn}>
              <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={20} color={saved ? theme.color.gold : theme.color.cream} />
            </Pressable>
            <Pressable onPress={viewOnMap} style={[styles.actionBtn, { marginLeft: 'auto' }]}>
              <Ionicons name="map-outline" size={18} color={theme.color.gold} />
              <Text style={[styles.actionText, { color: theme.color.gold }]}>Map</Text>
            </Pressable>
          </View>

          {/* Delete button, visible only to the spot's creator. */}
          {spot.created_by === session?.user.id && (
            <Pressable onPress={handleDelete} style={styles.deleteBtn}><Text style={styles.deleteBtnText}>Delete spot</Text></Pressable>
          )}

          {/* The viewer's private notes for this spot, with an "Add note" shortcut into the note editor. */}
          {session && (
            <View style={styles.notesSection}>
              <View style={styles.notesSectionHeader}>
                <Text style={styles.notesSectionHeading}>Your notes</Text>
                <Pressable onPress={() => router.push({ pathname: '/note-editor', params: { spotId: spot.id } })} style={styles.notesAddBtn} accessibilityLabel="Add a note for this spot">
                  <Ionicons name="add" size={16} color={theme.color.gold} />
                  <Text style={styles.notesAddBtnText}>Add note</Text>
                </Pressable>
              </View>
              {myNotes.map((n) => (
                <Pressable key={n.id} onPress={() => router.push({ pathname: '/note-editor', params: { id: n.id } })} style={styles.noteRow}>
                  <Ionicons name="document-text-outline" size={14} color={theme.color.muted} />
                  <Text style={styles.noteRowText} numberOfLines={1}>{n.title}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Comments section: top-level comments, each followed by its indented replies. */}
          <View style={styles.divider} />
          <Text style={styles.commentsHeading}>Comments</Text>

          {grouped.map((c) => (
            <View key={c.id} style={{ marginBottom: 16 }}>
              {/* Long-press a comment for edit/delete; tap avatar or name for the profile. */}
              <Pressable style={styles.commentRow} onLongPress={() => openCommentActions(c)} delayLongPress={250}>
                <Pressable onPress={() => goToProfile(c.user_id)}>
                  <View style={styles.commentAvatar}>
                    {c.avatar_url ? <Image source={{ uri: c.avatar_url }} style={styles.commentAvatarImage} /> : <Text style={styles.commentAvatarText}>{nameOf(c).charAt(0).toUpperCase()}</Text>}
                  </View>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Pressable onPress={() => goToProfile(c.user_id)}><Text style={styles.commentName}>{nameOf(c)}</Text></Pressable>
                  {/* Inline editor when this comment is being edited, otherwise text, time and Reply. */}
                  {editingComment?.id === c.id ? (
                    <View>
                      <TextInput
                        style={styles.commentEditInput}
                        value={editingComment.text}
                        onChangeText={(text) => setEditingComment({ id: c.id, text })}
                        multiline
                        autoFocus
                      />
                      <View style={styles.commentActionsRow}>
                        <Pressable onPress={() => setEditingComment(null)}><Text style={styles.commentActionText}>Cancel</Text></Pressable>
                        <Pressable onPress={saveEditComment}><Text style={[styles.commentActionText, { color: theme.color.gold }]}>Save</Text></Pressable>
                      </View>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.commentText}>{c.content}</Text>
                      <View style={styles.commentActionsRow}>
                        <Text style={styles.commentTimeAgo}>{formatTimeAgo(c.created_at)}</Text>
                        <Pressable onPress={() => setReplyingTo({ id: c.id, handle: nameOf(c) })}>
                          <Text style={styles.commentActionText}>Reply</Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                </View>
                <Pressable onPress={() => toggleCommentLike(c)} style={styles.commentLikeCol}>
                  <Ionicons name={c.liked_by_me ? 'heart' : 'heart-outline'} size={14} color={c.liked_by_me ? theme.color.ember : theme.color.muted} />
                  {c.like_count > 0 && <Text style={styles.commentLikeCount}>{c.like_count}</Text>}
                </Pressable>
              </Pressable>

              {/* Replies: indented and smaller. Replying to a reply still targets the top-level comment c. */}
              {c.replies.map((r) => (
                <Pressable key={r.id} style={[styles.commentRow, { marginLeft: 40, marginTop: 10 }]} onLongPress={() => openCommentActions(r)} delayLongPress={250}>
                  <Pressable onPress={() => goToProfile(r.user_id)}>
                    <View style={styles.replyAvatar}>
                      {r.avatar_url ? <Image source={{ uri: r.avatar_url }} style={styles.commentAvatarImage} /> : <Text style={styles.replyAvatarText}>{nameOf(r).charAt(0).toUpperCase()}</Text>}
                    </View>
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Pressable onPress={() => goToProfile(r.user_id)}><Text style={styles.commentName}>{nameOf(r)}</Text></Pressable>
                    {editingComment?.id === r.id ? (
                      <View>
                        <TextInput
                          style={styles.commentEditInput}
                          value={editingComment.text}
                          onChangeText={(text) => setEditingComment({ id: r.id, text })}
                          multiline
                          autoFocus
                        />
                        <View style={styles.commentActionsRow}>
                          <Pressable onPress={() => setEditingComment(null)}><Text style={styles.commentActionText}>Cancel</Text></Pressable>
                          <Pressable onPress={saveEditComment}><Text style={[styles.commentActionText, { color: theme.color.gold }]}>Save</Text></Pressable>
                        </View>
                      </View>
                    ) : (
                      <>
                        <Text style={styles.commentText}>{r.content}</Text>
                        <View style={styles.commentActionsRow}>
                          <Text style={styles.commentTimeAgo}>{formatTimeAgo(r.created_at)}</Text>
                          <Pressable onPress={() => setReplyingTo({ id: c.id, handle: nameOf(r) })}>
                            <Text style={styles.commentActionText}>Reply</Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                  <Pressable onPress={() => toggleCommentLike(r)} style={styles.commentLikeCol}>
                    <Ionicons name={r.liked_by_me ? 'heart' : 'heart-outline'} size={13} color={r.liked_by_me ? theme.color.ember : theme.color.muted} />
                    {r.like_count > 0 && <Text style={styles.commentLikeCount}>{r.like_count}</Text>}
                  </Pressable>
                </Pressable>
              ))}
            </View>
          ))}
          {/* Empty state for comments. */}
          {comments.length === 0 && <Text style={styles.noComments}>Be the first to comment.</Text>}
        </View>
      </ScrollView>

      {/* "Replying to @handle" bar above the composer, with a cancel button. */}
      {replyingTo && (
        <View style={styles.replyingBar}>
          <Text style={styles.replyingText}>Replying to @{replyingTo.handle}</Text>
          <Pressable onPress={() => setReplyingTo(null)}><Text style={styles.replyingCancel}>✕</Text></Pressable>
        </View>
      )}
      {/* Comment composer pinned at the bottom, padded for the device's safe-area inset. */}
      <View style={[styles.commentInputRow, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <TextInput style={styles.commentInput} placeholder={replyingTo ? `Reply to ${replyingTo.handle}...` : 'Add a comment...'} placeholderTextColor={theme.color.muted} value={commentText} onChangeText={setCommentText} />
        <Pressable onPress={submitComment} style={styles.sendBtn}><Ionicons name="send" size={17} color={theme.color.dusk} /></Pressable>
      </View>

      {/* Full-screen photo viewer, showing the styled version when one exists. */}
      <ImageViewer visible={viewerVisible} uri={styledPhotoUrl ?? spot.photo_url} onClose={() => setViewerVisible(false)} />

      {/* Comment action sheet: Edit is offered only on your own comment; Delete always (sheet opens only for author or spot owner). */}
      <ActionSheet
        visible={!!commentActionTarget}
        onClose={() => setCommentActionTarget(null)}
        options={[
          ...(commentActionTarget?.user_id === session?.user.id
            ? [{ key: 'edit', label: 'Edit', icon: 'create-outline' as const, onPress: () => commentActionTarget && startEditComment(commentActionTarget) }]
            : []),
          { key: 'delete', label: 'Delete', icon: 'trash-outline' as const, destructive: true, onPress: () => commentActionTarget && deleteComment(commentActionTarget) },
        ]}
      />
    </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

// Styles use design tokens (colors, fonts, radii) from constants/theme.ts.
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Hero and creator
  heroImage: { width: '100%', height: 300 },
  backBtn: { position: 'absolute', left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(20,23,31,0.55)', alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  creatorAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  creatorAvatarImage: { width: '100%', height: '100%' },
  creatorAvatarText: { fontFamily: theme.font.display, fontSize: 11, color: theme.color.dusk },
  creatorName: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.gold },
  // Title, tags, description, geo tag
  title: { fontFamily: theme.font.display, fontSize: 22, color: theme.color.cream },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tag: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  tagText: { fontFamily: theme.font.mono, fontSize: 10.5, color: theme.color.gold },
  description: { fontFamily: theme.font.bodyRegular, fontSize: 14, color: theme.color.cream, marginTop: 14, lineHeight: 20 },
  timeAgo: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.muted, marginTop: 8 },
  geoTagText: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.gold, marginTop: 4 },
  geoTagAddress: { fontFamily: theme.font.bodyRegular, fontSize: 10.5, color: theme.color.muted, marginTop: 2 },
  // Action bar and owner delete
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.color.surface2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.cream },
  deleteBtn: { marginTop: 16 },
  deleteBtnText: { color: theme.color.ember, fontFamily: theme.font.body, fontSize: 12.5 },
  // Notes section
  notesSection: { marginTop: 20 },
  notesSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  notesSectionHeading: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted },
  notesAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  notesAddBtnText: { fontFamily: theme.font.body, fontSize: 12, color: theme.color.gold },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.sm, padding: 10, marginTop: 10 },
  noteRowText: { flex: 1, fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.cream },
  // Comments
  divider: { height: 1, backgroundColor: theme.color.surface2, marginTop: 24, marginBottom: 16 },
  commentsHeading: { fontFamily: theme.font.display, fontSize: 15, color: theme.color.cream, marginBottom: 14 },
  commentRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  commentAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.color.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  replyAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: theme.color.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  commentAvatarImage: { width: '100%', height: '100%' },
  commentAvatarText: { fontFamily: theme.font.display, fontSize: 12, color: theme.color.gold },
  replyAvatarText: { fontFamily: theme.font.display, fontSize: 10, color: theme.color.gold },
  commentName: { fontFamily: theme.font.body, fontSize: 12.5, color: theme.color.cream },
  commentText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, marginTop: 2 },
  commentEditInput: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.cream, marginTop: 2, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.sm, padding: 8 },
  commentActionsRow: { flexDirection: 'row', gap: 14, marginTop: 5 },
  commentTimeAgo: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.muted },
  commentActionText: { fontFamily: theme.font.body, fontSize: 11, color: theme.color.gold },
  commentLikeCol: { alignItems: 'center', gap: 2, paddingTop: 2 },
  commentLikeCount: { fontFamily: theme.font.mono, fontSize: 9, color: theme.color.muted },
  noComments: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted },
  // Reply bar and comment composer
  replyingBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8, backgroundColor: theme.color.surface, borderTopWidth: 1, borderTopColor: theme.color.surface2 },
  replyingText: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.gold },
  replyingCancel: { color: theme.color.muted, fontSize: 13 },
  commentInputRow: { flexDirection: 'row', gap: 10, paddingTop: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: theme.color.surface2, backgroundColor: theme.color.dusk, alignItems: 'center' },
  commentInput: { flex: 1, backgroundColor: theme.color.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 13.5, borderWidth: 1, borderColor: theme.color.surface2 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center' },
});