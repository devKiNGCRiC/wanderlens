import { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { Avatar } from '@/components/Avatar';
import { ScreenBackground } from '@/components/ScreenBackground';

type Person = { id: string; username: string | null; full_name: string | null; avatar_url: string | null };

export default function CreateGroupScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [selected, setSelected] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

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

  function toggleSelect(person: Person) {
    setSelected((prev) => prev.some((p) => p.id === person.id) ? prev.filter((p) => p.id !== person.id) : [...prev, person]);
  }

  async function createGroup() {
    if (!session || creating) return;
    if (name.trim().length === 0) {
      Alert.alert('Name your group', 'Give the group a name first.');
      return;
    }
    if (selected.length === 0) {
      Alert.alert('Add members', 'Add at least one person to the group.');
      return;
    }
    setCreating(true);
    const { data, error } = await supabase.rpc('create_group_conversation', {
      p_name: name.trim(),
      p_member_ids: selected.map((p) => p.id),
    });
    setCreating(false);
    if (error || !data) {
      Alert.alert('Could not create group', 'Please try again.');
      return;
    }
    router.replace({ pathname: '/chat/[id]', params: { id: data as string } });
  }

  return (
    <ScreenBackground>
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'New group' }} />
      <TextInput
        style={styles.input}
        placeholder="Group name"
        placeholderTextColor={theme.color.muted}
        value={name}
        onChangeText={setName}
        autoFocus
      />

      {selected.length > 0 && (
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={selected}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item }) => {
            const label = item.username || item.full_name || 'traveler';
            return (
              <View style={styles.chip}>
                <Avatar uri={item.avatar_url} label={label} size={26} />
                <Text style={styles.chipText} numberOfLines={1}>{label}</Text>
                <Pressable onPress={() => toggleSelect(item)}><Ionicons name="close" size={13} color={theme.color.muted} /></Pressable>
              </View>
            );
          }}
        />
      )}

      <TextInput
        style={styles.input}
        placeholder="Search people to add"
        placeholderTextColor={theme.color.muted}
        value={query}
        onChangeText={onChangeQuery}
      />
      {loading && <ActivityIndicator color={theme.color.gold} style={{ marginTop: 20 }} />}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 100 }}
        renderItem={({ item }) => {
          const isSelected = selected.some((p) => p.id === item.id);
          const label = item.username || item.full_name || 'traveler';
          return (
            <Pressable style={styles.row} onPress={() => toggleSelect(item)}>
              <Avatar uri={item.avatar_url} label={label} size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.full_name || label}</Text>
                {item.username && <Text style={styles.username}>@{item.username}</Text>}
              </View>
              <Ionicons name={isSelected ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={isSelected ? theme.color.gold : theme.color.surface2} />
            </Pressable>
          );
        }}
        ListEmptyComponent={
          !loading && query.trim().length >= 2 ? <Text style={styles.emptyText}>No one found.</Text> : null
        }
      />

      <Pressable onPress={createGroup} disabled={creating} style={[styles.createBtn, creating && styles.createBtnDisabled]}>
        {creating ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.createBtnText}>Create group</Text>}
      </Pressable>
    </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 12, borderWidth: 1, borderColor: theme.color.surface2, fontFamily: theme.font.bodyRegular, color: theme.color.cream, fontSize: 14, marginBottom: 12 },
  chipRow: { gap: 8, paddingBottom: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.color.surface, borderRadius: 18, paddingVertical: 4, paddingHorizontal: 8, borderWidth: 1, borderColor: theme.color.surface2, maxWidth: 140 },
  chipText: { fontFamily: theme.font.bodyRegular, fontSize: 11.5, color: theme.color.cream, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  name: { fontFamily: theme.font.body, fontSize: 14.5, color: theme.color.cream },
  username: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.gold, marginTop: 2 },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', marginTop: 30 },
  createBtn: { position: 'absolute', bottom: 24, left: 20, right: 20, backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 14, alignItems: 'center' },
  createBtnDisabled: { opacity: 0.6 },
  createBtnText: { fontFamily: theme.font.body, fontSize: 14.5, color: theme.color.dusk },
});
