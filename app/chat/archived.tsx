/**
 * Route: /chat/archived, Archived chats screen.
 *
 * Purpose: lists the conversations the signed-in user has archived (hidden
 * from the main inbox) and lets them unarchive one or open it. It is opened
 * from the archive icon in the header of the Chat tab (app/(tabs)/chat.tsx).
 * The route is registered by name in the signed-in-and-onboarded <Stack.Protected> block of app/_layout.tsx,
 * and it hides the native header itself via
 * <Stack.Screen options={{ headerShown: false }} />.
 *
 * How it works:
 * - Reads through the `list_conversations` RPC with `p_archived: true`. An
 *   RPC is a Postgres function called over the network; it returns rows that
 *   are already joined (other person / group name, last message preview,
 *   unread count), so the screen does not need several client-side queries.
 * - Re-fetches with useFocusEffect, so coming back from a thread shows the
 *   current list rather than stale rows.
 * - Unarchiving is optimistic: the row disappears from local state at once,
 *   then the `set_conversation_flag` RPC flips `is_archived` to false for
 *   this user only (the flag lives on the user's own conversation_members
 *   row, so the other person's inbox is unaffected).
 * - Each row reuses the shared ConversationRow component from the inbox and
 *   taps through to /chat/[id].
 */
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

/**
 * Archived chats list. Default export because expo-router turns every
 * default-exported component in app/ into a route.
 */
export default function ArchivedScreen() {
  const router = useRouter();
  // Safe-area insets so the custom header clears the status bar / notch.
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  // The archived conversation rows, and whether the first fetch is in flight.
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  /**
   * Fetches the user's archived conversations from `list_conversations`.
   * Wrapped in useCallback so its identity only changes when the session
   * changes, which keeps the useFocusEffect below from re-running needlessly.
   * On error the previous list is left in place.
   */
  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('list_conversations', { p_archived: true });
    if (!error) setConversations((data as ConversationSummary[]) ?? []);
    setLoading(false);
  }, [session]);

  // useFocusEffect runs every time this screen gains focus (not just on first
  // mount), so the list refreshes after returning from a chat thread.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  /**
   * Moves a conversation back to the main inbox. Removes it from the local
   * list first (optimistic update) so the tap feels instant, then clears the
   * `archived` flag server-side. The RPC result is not checked, so a failed
   * call would only show up on the next focus refresh.
   */
  async function unarchive(id: string) {
    setConversations((prev) => prev.filter((c) => c.conversation_id !== id));
    await supabase.rpc('set_conversation_flag', { p_conversation_id: id, p_flag: 'archived', p_value: false });
  }

  return (
    <ScreenBackground>
      {/* Hide the default stack header; this screen draws its own below. */}
      <Stack.Screen options={{ headerShown: false }} />
      {/* Custom header: back chevron + "Archived" title, padded below the status bar. */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.title}>Archived</Text>
      </View>

      {/* Spinner while loading, otherwise the list (which has its own empty state). */}
      {loading ? (
        <ActivityIndicator color={theme.color.gold} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.conversation_id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              {/* Same row component as the inbox; tapping opens the thread. */}
              <ConversationRow
                item={item}
                myUserId={session!.user.id}
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.conversation_id } })}
              />
              {/* Small pill under the row that moves the chat back to the inbox. */}
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

// Styles pull colors, fonts, and radii from the design tokens in constants/theme.ts.
const styles = StyleSheet.create({
  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 14 },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: theme.font.display, fontSize: 20, color: theme.color.cream },
  // List rows; the 62px left offsets line the separator and button up with
  // the text column of ConversationRow (past its avatar).
  row: { gap: 8 },
  separator: { height: 1, backgroundColor: theme.color.surface2, marginLeft: 62, marginVertical: 4 },
  unarchiveBtn: { alignSelf: 'flex-start', marginLeft: 62, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: 14, paddingVertical: 5, paddingHorizontal: 12 },
  unarchiveText: { fontFamily: theme.font.bodyRegular, fontSize: 11.5, color: theme.color.gold },
  // Empty state
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', padding: 40 },
});
