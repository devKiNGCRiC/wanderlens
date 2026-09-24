/**
 * Route: /notes, the user's private notes list.
 *
 * Purpose: a personal notebook for trip lists, camera settings and the like.
 * Each note can optionally be linked to a spot. Opened from the Profile tab
 * menu ("Notes"); registered as a modal inside the signed-in-and-onboarded
 * `<Stack.Protected>` block in app/_layout.tsx.
 *
 * How it works:
 * - Reads the `notes` table directly (not an RPC), filtered to the current
 *   user, newest first. The `spots(title, photo_url)` part of the select is a
 *   Supabase embedded join through notes.spot_id, returned as a nested object.
 * - `useFocusEffect` re-fetches on focus, so a note created or edited in
 *   /note-editor shows up when the user comes back.
 * - The "+" button opens /note-editor blank; tapping a card opens it with
 *   `id`; long-press opens an ActionSheet with Delete.
 */
import { useState, useCallback } from 'react';
import { View, Text, Image, Pressable, FlatList, StyleSheet, Alert } from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ActionSheet } from '@/components/ActionSheet';
import { formatTimeAgo } from '@/lib/formatTimeAgo';

/**
 * One row from the `notes` table select below. `spots` is the embedded linked
 * spot (null when the note isn't attached to a spot).
 */
type Note = {
  id: string;
  title: string;
  body: string;
  spot_id: string | null;
  created_at: string;
  updated_at: string;
  spots: { title: string; photo_url: string | null } | null;
};

/**
 * Notes list screen. Fetches the user's notes on focus and renders them as
 * cards with an optional linked-spot badge and a created/edited time.
 */
export default function Notes() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  // The notes, whether a fetch is running (used to hide the empty message
  // mid-load), and the note whose long-press action sheet is open.
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionTarget, setActionTarget] = useState<Note | null>(null);

  // useFocusEffect re-runs this each time the screen is focused, not just on
  // mount, so edits made in /note-editor are reflected on return. The async
  // work is wrapped in an IIFE because the effect callback can't be async.
  // The query `error` isn't read; a failure shows as an empty list.
  useFocusEffect(useCallback(() => {
    (async () => {
      if (!session) return;
      setLoading(true);
      const { data } = await supabase
        .from('notes')
        .select('id, title, body, spot_id, created_at, updated_at, spots(title, photo_url)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      // `as unknown as Note[]`: the client isn't typed against the schema, so
      // the embedded-join result is cast to the local row shape.
      setNotes((data as unknown as Note[]) ?? []);
      setLoading(false);
    })();
  }, [session]));

  /**
   * Confirms, then deletes the note from the `notes` table and removes it
   * from local state. The delete's error result is not checked, so the row
   * is removed from the list either way.
   */
  function handleDelete(id: string) {
    Alert.alert('Delete this note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('notes').delete().eq('id', id);
          setNotes((prev) => prev.filter((n) => n.id !== id));
        },
      },
    ]);
  }

  // Native header hidden in favour of the custom top bar.
  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Top bar: back, title, and "+" to create a new note. */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.heading}>Notes</Text>
        <Pressable onPress={() => router.push('/note-editor')} style={styles.addBtn} accessibilityLabel="New note">
          <Ionicons name="add" size={22} color={theme.color.dusk} />
        </Pressable>
      </View>

      {/* Notes list. Tap opens the editor; long-press opens the delete sheet. */}
      <FlatList
        data={notes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item }) => {
          // A note counts as edited when its timestamps differ; the footer then
          // shows "Edited <time ago>" based on updated_at.
          const edited = item.updated_at !== item.created_at;
          return (
            <Pressable
              style={({ pressed }) => [styles.noteCard, pressed && styles.noteCardPressed]}
              onPress={() => router.push({ pathname: '/note-editor', params: { id: item.id } })}
              onLongPress={() => setActionTarget(item)}
              delayLongPress={250}
            >
              <View style={styles.noteHeader}>
                <View style={styles.noteIcon}>
                  <Ionicons name="document-text-outline" size={15} color={theme.color.gold} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.noteTitle} numberOfLines={1}>{item.title}</Text>
                  {!!item.body && <Text style={styles.noteBody} numberOfLines={2}>{item.body}</Text>}
                </View>
              </View>
              {/* Footer: linked-spot badge (or an empty View so the time stays
                  right-aligned via space-between) and the timestamp. */}
              <View style={styles.noteFooter}>
                {item.spots ? (
                  <View style={styles.spotBadge}>
                    {item.spots.photo_url && <Image source={{ uri: item.spots.photo_url }} style={styles.spotBadgeImage} />}
                    <Text style={styles.spotBadgeText} numberOfLines={1}>{item.spots.title}</Text>
                  </View>
                ) : <View />}
                <Text style={styles.noteTime}>{edited ? 'Edited ' : ''}{formatTimeAgo(edited ? item.updated_at : item.created_at)}</Text>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={!loading ? <Text style={styles.emptyText}>No notes yet — jot down your next destination list, camera settings, or anything else worth remembering.</Text> : null}
      />

      {/* Long-press action sheet for the selected note. */}
      <ActionSheet
        visible={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={actionTarget?.title}
        options={[
          { key: 'delete', label: 'Delete note', icon: 'trash-outline', destructive: true, onPress: () => actionTarget && handleDelete(actionTarget.id) },
        ]}
      />
    </ScreenBackground>
  );
}

// Styles use colour, font and radius tokens from constants/theme.ts.
const styles = StyleSheet.create({
  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' },
  heading: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center' },
  // Note card
  noteCard: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, padding: 14 },
  noteCardPressed: { opacity: 0.7 },
  noteHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  noteIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.color.goldTint, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  noteTitle: { fontFamily: theme.font.body, fontSize: 15.5, color: theme.color.cream },
  noteBody: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, marginTop: 4, lineHeight: 18 },
  noteFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  spotBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.color.mediaCasing, borderRadius: 14, paddingVertical: 4, paddingHorizontal: 8, flexShrink: 1 },
  spotBadgeImage: { width: 18, height: 18, borderRadius: 4 },
  spotBadgeText: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.gold, flexShrink: 1 },
  noteTime: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.muted },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', padding: 40, lineHeight: 19 },
});
