/**
 * Route: /new-message, pick a person to start a direct chat with, or pick a
 * destination to share a spot to.
 *
 * Purpose: two entry points, one screen. Registered as a modal inside the
 * signed-in-and-onboarded `<Stack.Protected>` block in app/_layout.tsx.
 * - From the Chat tab's "New message" action: search people, tap one, land in
 *   the 1:1 conversation with them.
 * - From a spot's share button (app/spot/[id].tsx) with `shareSpotId`: the
 *   title becomes "Send to...", existing conversations are listed above the
 *   search, and choosing a target first posts the spot as a message there.
 *
 * How it works:
 * - People search queries the `profiles` table (username or full name,
 *   case-insensitive, 20 max, excluding yourself) on each keystroke of 2+ chars.
 * - `list_conversations` RPC (share mode only) loads the user's accepted chats.
 * - `get_or_create_direct_conversation` RPC returns the existing 1:1 chat or
 *   creates one. Server-side, if the two users aren't connected the other
 *   person's membership starts as a message 'request' rather than 'accepted'.
 * - Sharing inserts a `messages` row with `message_type: 'spot'`.
 * - Finishes with `router.replace` to /chat/[id], so Back from the chat
 *   doesn't return to this picker.
 */
import { useState, useCallback } from 'react';
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect, Stack } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { profileSearchFilter } from '@/lib/profiles';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { Avatar } from '@/components/Avatar';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ConversationRow, type ConversationSummary } from '@/components/chat/ConversationRow';

/** One search result row from the `profiles` table. */
type Person = { id: string; username: string | null; full_name: string | null; avatar_url: string | null };

/**
 * New message / share-to picker screen. See the file header for the two modes.
 */
export default function NewMessageScreen() {
  const router = useRouter();
  // Present only when opened from a spot's share button.
  const { shareSpotId } = useLocalSearchParams<{ shareSpotId?: string }>();
  const { session } = useAuth();
  // Search box text, people results, and (share mode) existing conversations.
  // `starting` holds the id of the row being opened so only that row shows a
  // spinner and further taps are ignored until it finishes.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

  /**
   * Searches profiles by username or full name. Queries under 2 characters
   * clear the results without a network call. `.or()` takes a PostgREST
   * filter string; `ilike` with `%q%` is a case-insensitive "contains" match.
   * There is no debounce, so every keystroke sends a request.
   */
  const search = useCallback(async (q: string) => {
    // Sanitised filter string (see lib/profiles.ts); null means the query is
    // too short once special characters are removed.
    const filter = profileSearchFilter(q);
    if (!session || !filter) {
      setResults([]);
      setSearchError(false);
      return;
    }
    setLoading(true);
    setSearchError(false);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .neq('id', session.user.id)
      .or(filter)
      .limit(20);
    if (error) {
      setSearchError(true);
      setLoading(false);
      return;
    }
    setResults((data as Person[]) ?? []);
    setLoading(false);
  }, [session]);

  // Share mode only: load the user's accepted conversations each time the
  // screen is focused (useFocusEffect runs on every focus, not just mount).
  // A failure leaves the list empty and the search box still works.
  useFocusEffect(useCallback(() => {
    if (!shareSpotId || !session) return;
    supabase.rpc('list_conversations', { p_status: 'accepted' }).then(({ data, error }) => {
      if (!error) setConversations((data as ConversationSummary[]) ?? []);
    });
  }, [shareSpotId, session]));

  /** Keeps the input controlled and fires a search for the new text. */
  function onChangeQuery(q: string) {
    setQuery(q);
    search(q);
  }

  /**
   * Posts the shared spot as a 'spot' message in the given conversation.
   * @returns true on success (or when not in share mode, so callers can carry
   * on), false after alerting the user that sending failed.
   */
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

  /**
   * Handles a tap on either a person or an existing conversation.
   * 1. Ignore taps while another target is being opened.
   * 2. For a person, get (or create) the direct conversation via RPC.
   * 3. In share mode, send the spot into that conversation.
   * 4. Replace this screen with the chat.
   * @param personId set when a search result was tapped
   * @param conversationId set when an existing conversation was tapped
   */
  async function selectTarget(personId?: string, conversationId?: string) {
    if (starting) return;
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

  // Unlike most modals here, this one keeps the native header and only
  // changes its title depending on the mode.
  return (
    <ScreenBackground>
    <View style={styles.container}>
      <Stack.Screen options={{ title: shareSpotId ? 'Send to…' : 'New message' }} />

      {/* Share mode: existing conversations as quick targets, shown only
          while the search box is empty. Height-capped so search stays visible. */}
      {shareSpotId && conversations.length > 0 && query.trim().length === 0 && (
        <>
          <Text style={styles.sectionLabel}>Your conversations</Text>
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.conversation_id}
            style={{ maxHeight: 260 }}
            contentContainerStyle={{ paddingBottom: 10 }}
            renderItem={({ item }) => (
              <View style={styles.conversationRowWrap}>
                <View style={{ flex: 1 }}>
                  <ConversationRow item={item} myUserId={session!.user.id} onPress={() => selectTarget(undefined, item.conversation_id)} />
                </View>
                {starting === item.conversation_id && <ActivityIndicator color={theme.color.gold} />}
              </View>
            )}
          />
          <Text style={styles.sectionLabel}>Or search someone new</Text>
        </>
      )}

      {/* People search. Auto-focuses only in plain "new message" mode. */}
      <TextInput
        style={styles.input}
        placeholder="Search by name or username"
        placeholderTextColor={theme.color.muted}
        value={query}
        onChangeText={onChangeQuery}
        autoFocus={!shareSpotId}
      />
      {/* Search loading and error (with Retry) states. */}
      {loading && <ActivityIndicator color={theme.color.gold} style={{ marginTop: 20 }} />}
      {searchError && !loading && (
        <View style={styles.searchErrorRow}>
          <Text style={styles.searchErrorText}>Couldn&apos;t search — try again.</Text>
          <Pressable onPress={() => search(query)}><Text style={styles.searchRetryText}>Retry</Text></Pressable>
        </View>
      )}
      {/* Search results. Rows are disabled while any target is opening. */}
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

// Styles use colour, font and radius tokens from constants/theme.ts.
const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  sectionLabel: { fontFamily: theme.font.mono, fontSize: 10.5, color: theme.color.muted, marginBottom: 8, marginTop: 4 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 12, borderWidth: 1, borderColor: theme.color.surface2, fontFamily: theme.font.bodyRegular, color: theme.color.cream, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  conversationRowWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontFamily: theme.font.body, fontSize: 14.5, color: theme.color.cream },
  username: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.gold, marginTop: 2 },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', marginTop: 30 },
  searchErrorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  searchErrorText: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted },
  searchRetryText: { fontFamily: theme.font.body, fontSize: 12.5, color: theme.color.gold },
});
