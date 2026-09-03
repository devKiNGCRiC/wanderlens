import { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { Avatar } from '@/components/Avatar';

type Person = { id: string; username: string | null; full_name: string | null; avatar_url: string | null };

export default function NewMessageScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
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

  function onChangeQuery(q: string) {
    setQuery(q);
    search(q);
  }

  async function startConversation(personId: string) {
    setStarting(personId);
    const { data, error } = await supabase.rpc('get_or_create_direct_conversation', { other_user_id: personId });
    setStarting(null);
    if (!error && data) {
      router.replace({ pathname: '/chat/[id]', params: { id: data as string } });
    }
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'New message' }} />
      <TextInput
        style={styles.input}
        placeholder="Search by name or username"
        placeholderTextColor={theme.color.muted}
        value={query}
        onChangeText={onChangeQuery}
        autoFocus
      />
      {loading && <ActivityIndicator color={theme.color.gold} style={{ marginTop: 20 }} />}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
        renderItem={({ item }) => {
          const name = item.username || item.full_name || 'traveler';
          return (
            <Pressable style={styles.row} onPress={() => startConversation(item.id)} disabled={!!starting}>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.dusk, padding: 20 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 12, borderWidth: 1, borderColor: theme.color.surface2, fontFamily: theme.font.bodyRegular, color: theme.color.cream, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  name: { fontFamily: theme.font.body, fontSize: 14.5, color: theme.color.cream },
  username: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.gold, marginTop: 2 },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', marginTop: 30 },
});
