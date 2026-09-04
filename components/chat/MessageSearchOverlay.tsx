import { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { formatTimeAgo } from '@/lib/formatTimeAgo';

type SearchResult = { id: string; sender_id: string; content: string; created_at: string; sender_username: string | null; sender_full_name: string | null };

type Props = {
  visible: boolean;
  conversationId: string;
  myUserId: string;
  onClose: () => void;
};

export function MessageSearchOverlay({ visible, conversationId, myUserId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
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
    setResults((data as SearchResult[]) ?? []);
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
          renderItem={({ item }) => (
            <View style={styles.resultRow}>
              <Text style={styles.resultSender}>{item.sender_id === myUserId ? 'You' : (item.sender_username || item.sender_full_name || 'traveler')}</Text>
              <Text style={styles.resultContent} numberOfLines={2}>{item.content}</Text>
              <Text style={styles.resultTime}>{formatTimeAgo(item.created_at)}</Text>
            </View>
          )}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.dusk },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 10, borderWidth: 1, borderColor: theme.color.surface2, fontFamily: theme.font.bodyRegular, color: theme.color.cream, fontSize: 14 },
  resultRow: { paddingVertical: 10 },
  resultSender: { fontFamily: theme.font.body, fontSize: 11.5, color: theme.color.gold, marginBottom: 3 },
  resultContent: { fontFamily: theme.font.bodyRegular, fontSize: 13.5, color: theme.color.cream, lineHeight: 18 },
  resultTime: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.muted, marginTop: 4 },
  separator: { height: 1, backgroundColor: theme.color.surface2 },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', marginTop: 30 },
});
