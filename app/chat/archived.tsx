import { useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ConversationRow, type ConversationSummary } from '@/components/chat/ConversationRow';

export default function ArchivedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('list_conversations', { p_archived: true });
    if (!error) setConversations((data as ConversationSummary[]) ?? []);
    setLoading(false);
  }, [session]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function unarchive(id: string) {
    setConversations((prev) => prev.filter((c) => c.conversation_id !== id));
    await supabase.rpc('set_conversation_flag', { p_conversation_id: id, p_flag: 'archived', p_value: false });
  }

  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.title}>Archived</Text>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.color.gold} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.conversation_id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <ConversationRow
                item={item}
                myUserId={session!.user.id}
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.conversation_id } })}
              />
              <Pressable onPress={() => unarchive(item.conversation_id)} style={styles.unarchiveBtn}>
                <Text style={styles.unarchiveText}>Unarchive</Text>
              </Pressable>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={<Text style={styles.emptyText}>No archived chats.</Text>}
        />
      )}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 14 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: theme.font.display, fontSize: 20, color: theme.color.cream },
  row: { gap: 8 },
  separator: { height: 1, backgroundColor: theme.color.surface2, marginLeft: 62, marginVertical: 4 },
  unarchiveBtn: { alignSelf: 'flex-start', marginLeft: 62, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 12 },
  unarchiveText: { fontFamily: theme.font.bodyRegular, fontSize: 11.5, color: theme.color.gold },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', padding: 40 },
});
