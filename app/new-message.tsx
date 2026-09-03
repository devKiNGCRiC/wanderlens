import { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { Avatar } from '@/components/Avatar';
import { ScreenBackground } from '@/components/ScreenBackground';
import type { ConversationSummary } from '@/components/chat/ConversationRow';

type Person = { id: string; username: string | null; full_name: string | null; avatar_url: string | null };

export default function NewMessageScreen() {
  const router = useRouter();
  const { shareSpotId } = useLocalSearchParams<{ shareSpotId?: string }>();
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  const search = useCallback(async (q: string) => {
    if (!session || q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .neq('id', session.user.id)
      .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
      .limit(20);
    setResults((data as Person[]) ?? []);
    setLoading(false);
  }, [session]);

  useFocusEffect(useCallback(() => {
    if (!shareSpotId || !session) return;
    supabase.rpc('list_conversations', { p_status: 'accepted' }).then(({ data, error }) => {
      if (!error) setConversations((data as ConversationSummary[]) ?? []);
    });
  }, [shareSpotId, session]));

  function onChangeQuery(q: string) {
    setQuery(q);
    search(q);
  }

  async function shareIntoConversation(conversationId: string): Promise<boolean> {
    if (!session || !shareSpotId) return true;
    const { error } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: session.user.id,
      message_type: 'spot',
      shared_spot_id: shareSpotId,
    });
    if (error) {
      Alert.alert('Could not send', 'This spot could not be shared. Please try again.');
      return false;
    }
    return true;
  }

  async function selectTarget(personId?: string, conversationId?: string) {
    const key = personId ?? conversationId ?? '';
    setStarting(key);
    let targetId = conversationId ?? null;
    if (!targetId && personId) {
      const { data, error } = await supabase.rpc('get_or_create_direct_conversation', { other_user_id: personId });
      if (error || !data) { setStarting(null); Alert.alert('Could not start conversation', 'Please try again.'); return; }
      targetId = data as string;
    }
    if (!targetId) { setStarting(null); return; }

    if (shareSpotId) {
      const ok = await shareIntoConversation(targetId);
      if (!ok) { setStarting(null); return; }
    }

    setStarting(null);
    router.replace({ pathname: '/chat/[id]', params: { id: targetId } });
  }

  return (
    <ScreenBackground>
    <View style={styles.container}>
      <Stack.Screen options={{ title: shareSpotId ? 'Send to…' : 'New message' }} />

      {shareSpotId && conversations.length > 0 && query.trim().length === 0 && (
        <>
          <Text style={styles.sectionLabel}>Your conversations</Text>
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.conversation_id}
            style={{ maxHeight: 260 }}
            contentContainerStyle={{ paddingBottom: 10 }}
            renderItem={({ item }) => {
              const name = item.other_username || item.other_full_name || 'traveler';
              return (
                <Pressable style={styles.row} onPress={() => selectTarget(undefined, item.conversation_id)} disabled={!!starting}>
                  <Avatar uri={item.other_avatar_url} label={name} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{name}</Text>
                  </View>
                  {starting === item.conversation_id && <ActivityIndicator color={theme.color.gold} />}
                </Pressable>
              );
            }}
          />
          <Text style={styles.sectionLabel}>Or search someone new</Text>
        </>
      )}

      <TextInput
        style={styles.input}
        placeholder="Search by name or username"
        placeholderTextColor={theme.color.muted}
        value={query}
        onChangeText={onChangeQuery}
        autoFocus={!shareSpotId}
      />
      {loading && <ActivityIndicator color={theme.color.gold} style={{ marginTop: 20 }} />}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
        renderItem={({ item }) => {
          const name = item.username || item.full_name || 'traveler';
          return (
            <Pressable style={styles.row} onPress={() => selectTarget(item.id)} disabled={!!starting}>
              <Avatar uri={item.avatar_url} label={name} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.full_name || name}</Text>
                {item.username && <Text style={styles.username}>@{item.username}</Text>}
              </View>
              {starting === item.id && <ActivityIndicator color={theme.color.gold} />}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading && query.trim().length >= 2 ? (
            <Text style={styles.emptyText}>No one found.</Text>
          ) : null
        }
      />
    </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  sectionLabel: { fontFamily: theme.font.mono, fontSize: 10.5, color: theme.color.muted, marginBottom: 8, marginTop: 4 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 12, borderWidth: 1, borderColor: theme.color.surface2, fontFamily: theme.font.bodyRegular, color: theme.color.cream, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  name: { fontFamily: theme.font.body, fontSize: 14.5, color: theme.color.cream },
  username: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.gold, marginTop: 2 },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', marginTop: 30 },
});
