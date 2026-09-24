/**
 * MessageSearchOverlay, full-screen "search this chat" modal.
 *
 * Purpose: opened from the search icon in a chat thread's header
 * (app/chat/[id].tsx). The user types a query and sees matching messages
 * from this one conversation, each row showing sender, content and
 * time. Spot, location and photo results render as their rich
 * previews and stay tappable.
 *
 * How it works:
 * - Typing is debounced (350 ms): each keystroke cancels the pending timer
 *   and starts a new one, so the server is only queried once typing pauses.
 * - Queries shorter than 2 characters are not sent.
 * - Search runs through the search_conversation_messages Supabase RPC (a
 *   Postgres function called with supabase.rpc). Per the project's
 *   read/write split, reads go through RPCs; see the
 *   chat_phase2_search migrations under supabase/migrations for its SQL.
 * - Photo results only carry a storage path. The 'message-media' bucket is
 *   read through signed URLs (temporary, expiring links), so the overlay
 *   signs each photo path for 1 hour before showing thumbnails.
 * - Tapping a result: spots navigate to /spot/[id], locations open the maps
 *   app via openInMaps(), photos open in the shared <ImageViewer>.
 * - Closing the modal resets the query, results and any pending timer.
 */
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

/** Supabase Storage bucket holding chat photos (same constant as app/chat/[id].tsx). */
const MEDIA_BUCKET = 'message-media';

/**
 * One row returned by the search_conversation_messages RPC. The shared_spot_*
 * and location_* fields are only filled for 'spot' and 'location' messages.
 * media_url is not from the server: it is added client-side after signing
 * media_path for photo results.
 */
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

/**
 * visible / onClose: controlled by the chat screen.
 * conversationId: the thread to search within.
 * myUserId: used to label the user's own results as "You".
 */
type Props = {
  visible: boolean;
  conversationId: string;
  myUserId: string;
  onClose: () => void;
};

/** Search modal for one conversation. Owns its query, results and viewer state. */
export function MessageSearchOverlay({ visible, conversationId, myUserId, onClose }: Props) {
  // Safe-area insets keep the search bar clear of the status bar / notch.
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Search state: the text typed, the rows returned, and whether a request is in flight.
  // viewerUri is the photo currently open in the full-screen ImageViewer (null = closed).
  // debounceRef holds the pending timer; a ref (not state) because changing
  // it should not trigger a re-render.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset everything whenever the overlay is hidden, so reopening it starts
  // with an empty search and no stale timer fires later.
  useEffect(() => {
    if (!visible) {
      setQuery('');
      setResults([]);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  }, [visible]);

  /**
   * Runs one search against the server and stores the results.
   * Wrapped in useCallback (memoises the function between renders) so its
   * identity only changes when the conversation changes.
   * Side effects: Supabase RPC call, Storage URL signing, state updates.
   */
  const runSearch = useCallback(async (q: string) => {
    // Guard: under 2 characters, clear results instead of querying.
    if (q.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    // Server-side search scoped to this conversation. Only `data` is read;
    // an error leaves data null, which falls back to an empty list below.
    const { data } = await supabase.rpc('search_conversation_messages', { p_conversation_id: conversationId, p_query: q.trim() });
    const rows = (data as SearchResult[]) ?? [];
    // Photo results need a displayable URL for their thumbnail.
    const needsThumb = rows.filter((r) => (r.message_type === 'image' || r.message_type === 'gallery') && r.media_path);
    if (needsThumb.length > 0) {
      // Sign all photo paths in parallel (valid for 3600 s = 1 hour), then
      // merge each signed URL back onto its row by message id.
      const signed = await Promise.all(needsThumb.map((r) => supabase.storage.from(MEDIA_BUCKET).createSignedUrl(r.media_path as string, 3600)));
      const urlById = new Map(needsThumb.map((r, i) => [r.id, signed[i].data?.signedUrl]));
      setResults(rows.map((r) => (urlById.has(r.id) ? { ...r, media_url: urlById.get(r.id) } : r)));
    } else {
      setResults(rows);
    }
    setSearching(false);
  }, [conversationId]);

  /**
   * TextInput change handler: updates the visible text immediately and
   * (re)starts the 350 ms debounce before runSearch fires.
   */
  function onChangeQuery(q: string) {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q), 350);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top + 10 }]}>
        {/* Search bar: back button plus an auto-focused text input */}
        <View style={styles.searchRow}>
          <Pressable onPress={onClose} accessibilityLabel="Close search" style={styles.backBtn}>
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

        {/* Loading state while a search request is in flight */}
        {searching && <ActivityIndicator color={theme.color.gold} style={{ marginTop: 24 }} />}

        {/* Results list. Each row picks a renderer by message_type: spot card,
            location card, photo thumbnail + caption, or plain text.
            Empty state depends on the query: "No messages found." after a
            real search, "Keep typing…" for a 1-character query, and nothing
            when the box is blank or a search is running. */}
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 }}
          renderItem={({ item }) => {
            // "You" for my own messages, otherwise the sender's name with fallbacks.
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

      {/* Full-screen photo viewer for tapped photo results */}
      <ImageViewer visible={!!viewerUri} uri={viewerUri} onClose={() => setViewerUri(null)} />
    </Modal>
  );
}

// Styles use design tokens from constants/theme.ts.
const styles = StyleSheet.create({
  // Screen and search bar
  container: { flex: 1, backgroundColor: theme.color.dusk },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 10, borderWidth: 1, borderColor: theme.color.surface2, fontFamily: theme.font.bodyRegular, color: theme.color.cream, fontSize: 14 },
  // Result rows and photo thumbnails
  resultRow: { paddingVertical: 10 },
  resultSender: { fontFamily: theme.font.body, fontSize: 11.5, color: theme.color.gold, marginBottom: 5 },
  resultContent: { flex: 1, fontFamily: theme.font.bodyRegular, fontSize: 13.5, color: theme.color.cream, lineHeight: 18 },
  resultTime: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.muted, marginTop: 6 },
  mediaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 44, height: 44, borderRadius: theme.radius.sm, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImage: { width: '100%', height: '100%' },
  // Separator and empty-state text
  separator: { height: 1, backgroundColor: theme.color.surface2 },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', marginTop: 30 },
});
