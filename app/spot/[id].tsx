import { useState, useCallback } from 'react';
import { View, Text, Image, Pressable, ScrollView, TextInput, StyleSheet, Alert, ActivityIndicator, Share, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ImageViewer } from '@/components/ImageViewer';
import { formatTimeAgo } from '@/lib/formatTimeAgo';

type SpotDetail = {
  id: string; title: string; description: string | null; genre: string | null;
  best_time: string | null; time_of_day: string | null; photo_url: string | null;
  created_by: string | null; lng: number; lat: number; created_at: string;
  creator_username: string | null; creator_name: string | null; creator_avatar: string | null;
};
type CommentRow = {
  id: string; content: string; user_id: string; parent_comment_id: string | null; created_at: string;
  username: string | null; full_name: string | null; avatar_url: string | null;
  like_count: number; liked_by_me: boolean;
};

function nameOf(c: { username: string | null; full_name: string | null }) {
  return c.username || c.full_name || 'traveler';
}
function groupComments(rows: CommentRow[]) {
  const top = rows.filter((r) => !r.parent_comment_id);
  return top.map((t) => ({ ...t, replies: rows.filter((r) => r.parent_comment_id === t.id) }));
}

export default function SpotDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [spot, setSpot] = useState<SpotDetail | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; handle: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerVisible, setViewerVisible] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data: spotData } = await supabase.rpc('get_spot', { spot_id: id }).single();
    setSpot(spotData as SpotDetail);

    const { count } = await supabase.from('spot_likes').select('*', { count: 'exact', head: true }).eq('spot_id', id);
    setLikeCount(count ?? 0);

    if (session) {
      const { data: likeRow } = await supabase.from('spot_likes').select('*').eq('spot_id', id).eq('user_id', session.user.id).maybeSingle();
      setLiked(!!likeRow);
      const { data: savedRow } = await supabase.from('saved_spots').select('*').eq('spot_id', id).eq('user_id', session.user.id).maybeSingle();
      setSaved(!!savedRow);
    }

    const { data: commentData } = await supabase.rpc('get_spot_comments', { spot_id_param: id });
    setComments((commentData as CommentRow[]) ?? []);
    setLoading(false);
  }, [id, session]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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

  async function toggleCommentLike(comment: CommentRow) {
    if (!session) return;
    const isLiked = comment.liked_by_me;
    setComments((prev) => prev.map((c) => c.id === comment.id ? { ...c, liked_by_me: !isLiked, like_count: c.like_count + (isLiked ? -1 : 1) } : c));
    if (isLiked) await supabase.from('comment_likes').delete().eq('comment_id', comment.id).eq('user_id', session.user.id);
    else await supabase.from('comment_likes').insert({ comment_id: comment.id, user_id: session.user.id });
  }

  async function submitComment() {
    if (!session || !spot || !commentText.trim()) return;
    const { error } = await supabase.from('spot_comments').insert({
      spot_id: spot.id, user_id: session.user.id, content: commentText.trim(), parent_comment_id: replyingTo?.id ?? null,
    });
    if (!error) { setCommentText(''); setReplyingTo(null); load(); }
  }

  function handleShare() {
    if (!spot) return;
    Share.share({ message: `Check out "${spot.title}" on Wanderlens${spot.photo_url ? '\n' + spot.photo_url : ''}` });
  }
  function viewOnMap() {
    if (!spot) return;
    router.push({ pathname: '/(tabs)/map', params: { focusLat: String(spot.lat), focusLng: String(spot.lng) } });
  }
  function goToProfile(userId: string | null) {
    if (userId) router.push({ pathname: '/user/[id]', params: { id: userId } });
  }
  function handleDelete() {
    if (!spot) return;
    Alert.alert('Delete this spot?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.from('spots').delete().eq('id', spot.id); router.back(); } },
    ]);
  }

  if (loading || !spot) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}><ActivityIndicator color={theme.color.gold} /></View>
      </>
    );
  }

  const creatorHandle = spot.creator_username || spot.creator_name || 'traveler';
  const grouped = groupComments(comments);

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.color.dusk }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
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
          <Pressable style={styles.creatorRow} onPress={() => goToProfile(spot.created_by)}>
            <View style={styles.creatorAvatar}>
              {spot.creator_avatar ? <Image source={{ uri: spot.creator_avatar }} style={styles.creatorAvatarImage} /> : <Text style={styles.creatorAvatarText}>{creatorHandle.charAt(0).toUpperCase()}</Text>}
            </View>
            <Text style={styles.creatorName}>{creatorHandle}</Text>
          </Pressable>

          <Text style={styles.title}>{spot.title}</Text>
          <View style={styles.metaRow}>
            {spot.genre && <View style={styles.tag}><Text style={styles.tagText}>{spot.genre}</Text></View>}
            {spot.time_of_day && <View style={styles.tag}><Text style={styles.tagText}>{spot.time_of_day}</Text></View>}
            {spot.best_time && <View style={styles.tag}><Text style={styles.tagText}>{spot.best_time}</Text></View>}
          </View>
          {spot.description && <Text style={styles.description}>{spot.description}</Text>}
          <Text style={styles.timeAgo}>{formatTimeAgo(spot.created_at)}</Text>

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

          {spot.created_by === session?.user.id && (
            <Pressable onPress={handleDelete} style={styles.deleteBtn}><Text style={styles.deleteBtnText}>Delete spot</Text></Pressable>
          )}

          <View style={styles.divider} />
          <Text style={styles.commentsHeading}>Comments</Text>

          {grouped.map((c) => (
            <View key={c.id} style={{ marginBottom: 16 }}>
              <View style={styles.commentRow}>
                <Pressable onPress={() => goToProfile(c.user_id)}>
                  <View style={styles.commentAvatar}>
                    {c.avatar_url ? <Image source={{ uri: c.avatar_url }} style={styles.commentAvatarImage} /> : <Text style={styles.commentAvatarText}>{nameOf(c).charAt(0).toUpperCase()}</Text>}
                  </View>
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Pressable onPress={() => goToProfile(c.user_id)}><Text style={styles.commentName}>{nameOf(c)}</Text></Pressable>
                  <Text style={styles.commentText}>{c.content}</Text>
                  <View style={styles.commentActionsRow}>
                    <Text style={styles.commentTimeAgo}>{formatTimeAgo(c.created_at)}</Text>
                    <Pressable onPress={() => setReplyingTo({ id: c.id, handle: nameOf(c) })}>
                      <Text style={styles.commentActionText}>Reply</Text>
                    </Pressable>
                  </View>
                </View>
                <Pressable onPress={() => toggleCommentLike(c)} style={styles.commentLikeCol}>
                  <Ionicons name={c.liked_by_me ? 'heart' : 'heart-outline'} size={14} color={c.liked_by_me ? theme.color.ember : theme.color.muted} />
                  {c.like_count > 0 && <Text style={styles.commentLikeCount}>{c.like_count}</Text>}
                </Pressable>
              </View>

              {c.replies.map((r) => (
                <View key={r.id} style={[styles.commentRow, { marginLeft: 40, marginTop: 10 }]}>
                  <Pressable onPress={() => goToProfile(r.user_id)}>
                    <View style={styles.replyAvatar}>
                      {r.avatar_url ? <Image source={{ uri: r.avatar_url }} style={styles.commentAvatarImage} /> : <Text style={styles.replyAvatarText}>{nameOf(r).charAt(0).toUpperCase()}</Text>}
                    </View>
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Pressable onPress={() => goToProfile(r.user_id)}><Text style={styles.commentName}>{nameOf(r)}</Text></Pressable>
                    <Text style={styles.commentText}>{r.content}</Text>
                    <View style={styles.commentActionsRow}>
                      <Text style={styles.commentTimeAgo}>{formatTimeAgo(r.created_at)}</Text>
                      <Pressable onPress={() => setReplyingTo({ id: c.id, handle: nameOf(r) })}>
                        <Text style={styles.commentActionText}>Reply</Text>
                      </Pressable>
                    </View>
                  </View>
                  <Pressable onPress={() => toggleCommentLike(r)} style={styles.commentLikeCol}>
                    <Ionicons name={r.liked_by_me ? 'heart' : 'heart-outline'} size={13} color={r.liked_by_me ? theme.color.ember : theme.color.muted} />
                    {r.like_count > 0 && <Text style={styles.commentLikeCount}>{r.like_count}</Text>}
                  </Pressable>
                </View>
              ))}
            </View>
          ))}
          {comments.length === 0 && <Text style={styles.noComments}>Be the first to comment.</Text>}
        </View>
      </ScrollView>

      {replyingTo && (
        <View style={styles.replyingBar}>
          <Text style={styles.replyingText}>Replying to @{replyingTo.handle}</Text>
          <Pressable onPress={() => setReplyingTo(null)}><Text style={styles.replyingCancel}>✕</Text></Pressable>
        </View>
      )}
      <View style={[styles.commentInputRow, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <TextInput style={styles.commentInput} placeholder={replyingTo ? `Reply to ${replyingTo.handle}...` : 'Add a comment...'} placeholderTextColor={theme.color.muted} value={commentText} onChangeText={setCommentText} />
        <Pressable onPress={submitComment} style={styles.sendBtn}><Ionicons name="send" size={17} color={theme.color.dusk} /></Pressable>
      </View>

      <ImageViewer visible={viewerVisible} uri={spot.photo_url} onClose={() => setViewerVisible(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.dusk },
  heroImage: { width: '100%', height: 300 },
  backBtn: { position: 'absolute', left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(20,23,31,0.55)', alignItems: 'center', justifyContent: 'center' },
  body: { padding: 20 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  creatorAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  creatorAvatarImage: { width: '100%', height: '100%' },
  creatorAvatarText: { fontFamily: theme.font.display, fontSize: 11, color: theme.color.dusk },
  creatorName: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.gold },
  title: { fontFamily: theme.font.display, fontSize: 22, color: theme.color.cream },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tag: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  tagText: { fontFamily: theme.font.mono, fontSize: 10.5, color: theme.color.gold },
  description: { fontFamily: theme.font.bodyRegular, fontSize: 14, color: theme.color.cream, marginTop: 14, lineHeight: 20 },
  timeAgo: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.muted, marginTop: 8 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.color.surface2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.cream },
  deleteBtn: { marginTop: 16 },
  deleteBtnText: { color: theme.color.ember, fontFamily: theme.font.body, fontSize: 12.5 },
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
  commentActionsRow: { flexDirection: 'row', gap: 14, marginTop: 5 },
  commentTimeAgo: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.muted },
  commentActionText: { fontFamily: theme.font.body, fontSize: 11, color: theme.color.gold },
  commentLikeCol: { alignItems: 'center', gap: 2, paddingTop: 2 },
  commentLikeCount: { fontFamily: theme.font.mono, fontSize: 9, color: theme.color.muted },
  noComments: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted },
  replyingBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8, backgroundColor: theme.color.surface, borderTopWidth: 1, borderTopColor: theme.color.surface2 },
  replyingText: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.gold },
  replyingCancel: { color: theme.color.muted, fontSize: 13 },
  commentInputRow: { flexDirection: 'row', gap: 10, paddingTop: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: theme.color.surface2, backgroundColor: theme.color.dusk, alignItems: 'center' },
  commentInput: { flex: 1, backgroundColor: theme.color.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 13.5, borderWidth: 1, borderColor: theme.color.surface2 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center' },
});