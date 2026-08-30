import { useState, useCallback } from 'react';
import { View, Text, Image, Pressable, ScrollView, TextInput, StyleSheet, Alert, ActivityIndicator, Share, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ImageViewer } from '@/components/ImageViewer';

type SpotDetail = {
  id: string; title: string; description: string | null; genre: string | null;
  best_time: string | null; time_of_day: string | null; photo_url: string | null;
  created_by: string | null; lng: number; lat: number;
};
type Comment = {
  id: string; content: string; user_id: string;
  profiles: { full_name: string | null; avatar_url: string | null } | null;
};

export default function SpotDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [spot, setSpot] = useState<SpotDetail | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [commentText, setCommentText] = useState('');
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

    const { data: commentData } = await supabase
      .from('spot_comments')
      .select('id, content, user_id, profiles(full_name, avatar_url)')
      .eq('spot_id', id)
      .order('created_at', { ascending: true });
    setComments((commentData as any) ?? []);
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

  async function submitComment() {
    if (!session || !spot || !commentText.trim()) return;
    const { error } = await supabase.from('spot_comments').insert({ spot_id: spot.id, user_id: session.user.id, content: commentText.trim() });
    if (!error) { setCommentText(''); load(); }
  }

  function handleShare() {
    if (!spot) return;
    Share.share({ message: `Check out "${spot.title}" on Wanderlens${spot.photo_url ? '\n' + spot.photo_url : ''}` });
  }

  function viewOnMap() {
    if (!spot) return;
    router.push({ pathname: '/(tabs)/map', params: { focusLat: String(spot.lat), focusLng: String(spot.lng) } });
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
          <Text style={styles.title}>{spot.title}</Text>
          <View style={styles.metaRow}>
            {spot.genre && <View style={styles.tag}><Text style={styles.tagText}>{spot.genre}</Text></View>}
            {spot.time_of_day && <View style={styles.tag}><Text style={styles.tagText}>{spot.time_of_day}</Text></View>}
            {spot.best_time && <View style={styles.tag}><Text style={styles.tagText}>{spot.best_time}</Text></View>}
          </View>
          {spot.description && <Text style={styles.description}>{spot.description}</Text>}

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
          {comments.map((c) => (
            <View key={c.id} style={styles.commentRow}>
              <View style={styles.commentAvatar}>
                {c.profiles?.avatar_url ? <Image source={{ uri: c.profiles.avatar_url }} style={styles.commentAvatarImage} /> : <Text style={styles.commentAvatarText}>{c.profiles?.full_name?.charAt(0) ?? '?'}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.commentName}>{c.profiles?.full_name ?? 'Someone'}</Text>
                <Text style={styles.commentText}>{c.content}</Text>
              </View>
            </View>
          ))}
          {comments.length === 0 && <Text style={styles.noComments}>Be the first to comment.</Text>}
        </View>
      </ScrollView>

      <View style={[styles.commentInputRow, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <TextInput style={styles.commentInput} placeholder="Add a comment..." placeholderTextColor={theme.color.muted} value={commentText} onChangeText={setCommentText} />
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
  title: { fontFamily: theme.font.display, fontSize: 22, color: theme.color.cream },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  tag: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  tagText: { fontFamily: theme.font.mono, fontSize: 10.5, color: theme.color.gold },
  description: { fontFamily: theme.font.bodyRegular, fontSize: 14, color: theme.color.cream, marginTop: 14, lineHeight: 20 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.color.surface2 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.cream },
  deleteBtn: { marginTop: 16 },
  deleteBtnText: { color: theme.color.ember, fontFamily: theme.font.body, fontSize: 12.5 },
  divider: { height: 1, backgroundColor: theme.color.surface2, marginTop: 24, marginBottom: 16 },
  commentsHeading: { fontFamily: theme.font.display, fontSize: 15, color: theme.color.cream, marginBottom: 12 },
  commentRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  commentAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.color.surface2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  commentAvatarImage: { width: '100%', height: '100%' },
  commentAvatarText: { fontFamily: theme.font.display, fontSize: 12, color: theme.color.gold },
  commentName: { fontFamily: theme.font.body, fontSize: 12.5, color: theme.color.cream },
  commentText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, marginTop: 2 },
  noComments: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted },
  commentInputRow: { flexDirection: 'row', gap: 10, paddingTop: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: theme.color.surface2, backgroundColor: theme.color.dusk, alignItems: 'center' },
  commentInput: { flex: 1, backgroundColor: theme.color.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 13.5, borderWidth: 1, borderColor: theme.color.surface2 },
  sendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center' },
});