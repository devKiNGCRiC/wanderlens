import { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { formatTimeAgo } from '@/lib/formatTimeAgo';
import { openInMaps } from '@/lib/chat';
import { SpotPreviewCard } from '@/components/chat/SpotPreviewCard';
import { LocationPreviewCard } from '@/components/chat/LocationPreviewCard';
import { ImageViewer } from '@/components/ImageViewer';

const MEDIA_BUCKET = 'message-media';

type SearchResult = {
  id: string;
  sender_id: string;
  message_type: 'text' | 'image' | 'gallery' | 'spot' | 'location';
  content: string | null;
  created_at: string;
  sender_username: string | null;
  sender_full_name: string | null;
  media_path: string | null;
  media_url?: string;
  shared_spot_id: string | null;
  shared_spot_title: string | null;
  shared_spot_photo_url: string | null;
  shared_spot_genre: string | null;
  shared_spot_location_label: string | null;
  location_lat: number | null;
  location_lng: number | null;
  location_label: string | null;
};

type Props = {
  visible: boolean;
  conversationId: string;
  myUserId: string;
  onClose: () => void;
};

export function MessageSearchOverlay({ visible, conversationId, myUserId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }, [visible]);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const { data } = await supabase.rpc('search_conversation_messages', { p_conversation_id: conversationId, p_query: q.trim() });
    const rows = (data as SearchResult[]) ?? [];
    const needsThumb = rows.filter((r) => (r.message_type === 'image' || r.message_type === 'gallery') && r.media_path);
    if (needsThumb.length > 0) {
      const signed = await Promise.all(needsThumb.map((r) => supabase.storage.from(MEDIA_BUCKET).createSignedUrl(r.media_path as string, 3600)));
      const urlById = new Map(needsThumb.map((r, i) => [r.id, signed[i].data?.signedUrl]));
      setResults(rows.map((r) => (urlById.has(r.id) ? { ...r, media_url: urlById.get(r.id) } : r)));
    } else {
      setResults(rows);
    }
    setSearching(false);
  }, [conversationId]);

  function onChangeQuery(q: string) {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q), 350);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
        <View style={styles.searchRow}>
          <Pressable onPress={onClose} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
          </Pressable>
          <TextInput
            style={styles.input}
            placeholder="Search this chat"
            placeholderTextColor={theme.color.muted}
            value={query}
            onChangeText={onChangeQuery}
            autoFocus
          />
        </View>

        {searching && <ActivityIndicator color={theme.color.gold} style={{ marginTop: 24 }} />}

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }}
          renderItem={({ item }) => {
            const senderLabel = item.sender_id === myUserId ? 'You' : (item.sender_username || item.sender_full_name || 'traveler');
            return (
              <View style={styles.resultRow}>
                <Text style={styles.resultSender}>{senderLabel}</Text>
                {item.message_type === 'spot' ? (
                  <SpotPreviewCard
                    title={item.shared_spot_title}
                    photoUrl={item.shared_spot_photo_url}
                    genre={item.shared_spot_genre}
                    locationLabel={item.shared_spot_location_label}
                    onPress={() => item.shared_spot_id && router.push({ pathname: '/spot/[id]', params: { id: item.shared_spot_id } })}
                  />
                ) : item.message_type === 'location' ? (
                  <LocationPreviewCard
                    label={item.location_label}
                    lat={item.location_lat ?? 0}
                    lng={item.location_lng ?? 0}
                    onPress={() => item.location_lat != null && item.location_lng != null && openInMaps(item.location_lat, item.location_lng)}
                  />
                ) : item.message_type === 'image' || item.message_type === 'gallery' ? (
                  <Pressable style={styles.mediaRow} onPress={() => item.media_url && setViewerUri(item.media_url)}>
                    <View style={styles.thumb}>
                      {item.media_url ? <Image source={{ uri: item.media_url }} style={styles.thumbImage} contentFit="cover" /> : <Ionicons name="image-outline" size={18} color={theme.color.muted} />}
                    </View>
                    <Text style={styles.resultContent} numberOfLines={2}>{item.content || (item.message_type === 'gallery' ? 'Photos' : 'Photo')}</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.resultContent} numberOfLines={2}>{item.content}</Text>
                )}
                <Text style={styles.resultTime}>{formatTimeAgo(item.created_at)}</Text>
              </View>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            !searching && query.trim().length >= 2 ? (
              <Text style={styles.emptyText}>No messages found.</Text>
            ) : !searching && query.trim().length > 0 ? (
              <Text style={styles.emptyText}>Keep typing…</Text>
            ) : null
          }
        />
      </View>

      <ImageViewer visible={!!viewerUri} uri={viewerUri} onClose={() => setViewerUri(null)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.dusk },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 10, borderWidth: 1, borderColor: theme.color.surface2, fontFamily: theme.font.bodyRegular, color: theme.color.cream, fontSize: 14 },
  resultRow: { paddingVertical: 10 },
  resultSender: { fontFamily: theme.font.body, fontSize: 11.5, color: theme.color.gold, marginBottom: 5 },
  resultContent: { flex: 1, fontFamily: theme.font.bodyRegular, fontSize: 13.5, color: theme.color.cream, lineHeight: 18 },
  resultTime: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.muted, marginTop: 6 },
  mediaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 44, height: 44, borderRadius: theme.radius.sm, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },
  separator: { height: 1, backgroundColor: theme.color.surface2 },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', marginTop: 30 },
});
