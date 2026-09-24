/**
 * Route: /note-editor, create or edit a single note.
 *
 * Purpose: the editor behind the Notes list. Registered as a modal inside the
 * signed-in-and-onboarded `<Stack.Protected>` block in app/_layout.tsx.
 * Opened three ways, distinguished by route params:
 * - no params: a blank new note (the "+" on /notes)
 * - `id`: edit an existing note (tapping a card on /notes or on a spot page)
 * - `spotId`: a new note pre-linked to a spot (from app/spot/[id].tsx)
 *
 * How it works:
 * - On mount, loads the note (with its linked spot via an embedded join) or
 *   the pre-linked spot from the `spots` table, and records an `initial`
 *   snapshot of title/body/spot.
 * - `isDirty` compares current fields to that snapshot so Back can warn about
 *   unsaved changes.
 * - A note can be attached to any spot by searching `spots.title` (ilike,
 *   case-insensitive, max 10 results).
 * - Save inserts or updates a row in the `notes` table directly (writes go
 *   through tables), then closes with `router.back()`; /notes re-fetches on
 *   focus so the change shows there.
 *
 * Why useEffect rather than useFocusEffect: this is a modal that loads its
 * data once when opened; re-fetching on focus would overwrite unsaved typing.
 */
import { useState, useEffect } from 'react';
import { View, Text, TextInput, Image, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '@codler/react-native-keyboard-aware-scroll-view';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ScreenBackground } from '@/components/ScreenBackground';

/** Minimal spot info shown for a linked spot or a search result (from the `spots` table). */
type SpotRef = { id: string; title: string; photo_url: string | null };

/**
 * Note editor screen. Handles both "new" and "edit" modes, an optional linked
 * spot with inline search, save, delete and a discard-changes prompt.
 */
export default function NoteEditor() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  // Route params (see file header). Presence of `id` means edit mode.
  const { id, spotId } = useLocalSearchParams<{ id?: string; spotId?: string }>();
  const isEditing = !!id;

  // Editor state. `loading` only starts true in edit mode, where the note
  // must be fetched before the form can show.
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkedSpot, setLinkedSpot] = useState<SpotRef | null>(null);
  // Inline spot search UI: whether it's open, the query, results, and a spinner flag.
  const [spotSearchOpen, setSpotSearchOpen] = useState(false);
  const [spotQuery, setSpotQuery] = useState('');
  const [spotResults, setSpotResults] = useState<SpotRef[]>([]);
  const [searching, setSearching] = useState(false);
  // Snapshot of the values as loaded, used to detect unsaved changes.
  const [initial, setInitial] = useState<{ title: string; body: string; spotId: string | null }>({ title: '', body: '', spotId: null });

  // Initial load. Edit mode: fetch the note plus its embedded spot. New note
  // from a spot page: fetch that spot so it appears pre-linked. The snapshot
  // is set to match so the pre-filled state doesn't count as "dirty".
  // Query errors aren't read; a missing note just leaves the form empty.
  useEffect(() => {
    (async () => {
      if (isEditing) {
        const { data } = await supabase
          .from('notes')
          .select('title, body, spot_id, spots(id, title, photo_url)')
          .eq('id', id)
          .single();
        if (data) {
          setTitle(data.title);
          setBody(data.body);
          const spot = (data.spots as unknown as SpotRef) ?? null;
          setLinkedSpot(spot);
          setInitial({ title: data.title, body: data.body, spotId: spot?.id ?? null });
        }
        setLoading(false);
      } else if (spotId) {
        const { data } = await supabase.from('spots').select('id, title, photo_url').eq('id', spotId).maybeSingle();
        if (data) {
          setLinkedSpot(data);
          setInitial({ title: '', body: '', spotId: data.id });
        }
      }
    })();
  }, [id, isEditing, spotId]);

  // True when any field differs from what was loaded (derived on each render).
  const isDirty = title !== initial.title || body !== initial.body || (linkedSpot?.id ?? null) !== initial.spotId;

  /** Back button: closes directly if nothing changed, otherwise asks to discard. */
  function handleBack() {
    if (!isDirty) { router.back(); return; }
    Alert.alert('Discard changes?', 'Your edits haven’t been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => router.back() },
    ]);
  }

  /**
   * Runs on every keystroke in the spot search box. Queries shorter than 2
   * characters clear the results instead of hitting the network; otherwise it
   * does a case-insensitive "contains" match on spot titles (limit 10).
   * There is no debounce, so each keystroke sends a request.
   */
  async function searchSpots(query: string) {
    setSpotQuery(query);
    if (query.trim().length < 2) { setSpotResults([]); return; }
    setSearching(true);
    const { data } = await supabase.from('spots').select('id, title, photo_url').ilike('title', `%${query.trim()}%`).limit(10);
    setSpotResults(data ?? []);
    setSearching(false);
  }

  /** Links the chosen search result and closes/resets the search UI. */
  function selectSpot(spot: SpotRef) {
    setLinkedSpot(spot);
    setSpotSearchOpen(false);
    setSpotQuery('');
    setSpotResults([]);
  }

  /**
   * Saves the note: update in edit mode (also bumping `updated_at`, which the
   * Notes list uses to show "Edited"), insert otherwise. A title is required;
   * the body may be empty. Errors are thrown into the catch and alerted.
   * On success the modal closes.
   */
  async function handleSave() {
    if (!session) return;
    if (!title.trim()) {
      Alert.alert('Add a title', 'Give this note a short title before saving.');
      return;
    }
    setSaving(true);
    try {
      if (isEditing) {
        const { error } = await supabase
          .from('notes')
          .update({ title: title.trim(), body, spot_id: linkedSpot?.id ?? null, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('notes')
          .insert({ user_id: session.user.id, title: title.trim(), body, spot_id: linkedSpot?.id ?? null });
        if (error) throw error;
      }
      router.back();
    } catch (err: any) {
      Alert.alert('Could not save', err.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Edit mode only: confirms, deletes the note row, then closes the editor.
   * The delete's error result is not checked.
   */
  function handleDelete() {
    Alert.alert('Delete this note?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          await supabase.from('notes').delete().eq('id', id);
          router.back();
        },
      },
    ]);
  }

  // Edit mode: show only a spinner until the note has loaded.
  if (loading) {
    return (
      <ScreenBackground>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}><ActivityIndicator color={theme.color.gold} /></View>
      </ScreenBackground>
    );
  }

  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Top bar: back (with discard check), title, delete (edit mode only)
          and Save, which is disabled while saving or when the title is blank. */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={handleBack} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.heading} numberOfLines={1}>{isEditing ? 'Edit note' : 'New note'}</Text>
        <View style={styles.topBarActions}>
          {isEditing && (
            <Pressable onPress={handleDelete} style={styles.backBtn} accessibilityLabel="Delete note">
              <Ionicons name="trash-outline" size={18} color={theme.color.ember} />
            </Pressable>
          )}
          <Pressable
            onPress={handleSave}
            disabled={saving || !title.trim()}
            style={[styles.headerSaveBtn, (saving || !title.trim()) && styles.headerSaveBtnDisabled]}
          >
            {saving ? <ActivityIndicator size="small" color={theme.color.dusk} /> : <Text style={styles.headerSaveBtnText}>Save</Text>}
          </Pressable>
        </View>
      </View>

      <KeyboardAwareScrollView style={{ flex: 1 }} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" enableOnAndroid extraScrollHeight={28}>
        {/* Title and body inputs. */}
        <TextInput
          style={styles.titleInput}
          placeholder="Title"
          placeholderTextColor={theme.color.muted}
          value={title}
          onChangeText={setTitle}
        />
        <TextInput
          style={styles.bodyInput}
          placeholder="Write your note…"
          placeholderTextColor={theme.color.muted}
          value={body}
          onChangeText={setBody}
          multiline
          textAlignVertical="top"
        />

        {/* Linked spot section has three states: a linked spot with a remove
            button, the open search box with results, or an "Attach" button. */}
        <Text style={styles.label}>Linked spot (optional)</Text>
        {linkedSpot ? (
          <View style={styles.linkedSpotRow}>
            {linkedSpot.photo_url && <Image source={{ uri: linkedSpot.photo_url }} style={styles.linkedSpotImage} />}
            <Text style={styles.linkedSpotText} numberOfLines={1}>{linkedSpot.title}</Text>
            <Pressable onPress={() => setLinkedSpot(null)} accessibilityLabel="Remove linked spot" hitSlop={9}>
              <Ionicons name="close-circle" size={20} color={theme.color.muted} />
            </Pressable>
          </View>
        ) : spotSearchOpen ? (
          <View>
            <View style={styles.spotSearchRow}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Search spots by title"
                placeholderTextColor={theme.color.muted}
                value={spotQuery}
                onChangeText={searchSpots}
                autoFocus
              />
              <Pressable onPress={() => { setSpotSearchOpen(false); setSpotQuery(''); setSpotResults([]); }} style={styles.closeSearchBtn} accessibilityLabel="Cancel spot search" hitSlop={9}>
                <Ionicons name="close" size={18} color={theme.color.muted} />
              </Pressable>
            </View>
            {searching && <ActivityIndicator color={theme.color.gold} style={{ marginTop: 10 }} size="small" />}
            {!searching && spotQuery.trim().length >= 2 && spotResults.length === 0 && (
              <Text style={styles.noResultsText}>No spots found for &ldquo;{spotQuery.trim()}&rdquo;</Text>
            )}
            {/* At most 10 results, so a mapped ScrollView is used rather than a
                FlatList; nestedScrollEnabled lets it scroll inside the outer
                keyboard-aware scroll view on Android. */}
            <ScrollView style={styles.spotResultsList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {spotResults.map((s) => (
                <Pressable key={s.id} onPress={() => selectSpot(s)} style={({ pressed }) => [styles.spotResultRow, pressed && styles.rowPressed]}>
                  {s.photo_url && <Image source={{ uri: s.photo_url }} style={styles.linkedSpotImage} />}
                  <Text style={styles.linkedSpotText} numberOfLines={1}>{s.title}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : (
          <Pressable onPress={() => setSpotSearchOpen(true)} style={styles.attachBtn}>
            <Ionicons name="location-outline" size={16} color={theme.color.gold} />
            <Text style={styles.attachBtnText}>Attach to a spot</Text>
          </Pressable>
        )}
      </KeyboardAwareScrollView>
    </ScreenBackground>
  );
}

// Styles use colour, font and radius tokens from constants/theme.ts.
const styles = StyleSheet.create({
  // Loading and top bar
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, textAlign: 'center', fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  topBarActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerSaveBtn: { backgroundColor: theme.color.gold, borderRadius: 16, minWidth: 64, height: 32, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  headerSaveBtnDisabled: { opacity: 0.45 },
  headerSaveBtnText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 13.5 },
  // Editor inputs
  container: { padding: 24, paddingBottom: 60 },
  titleInput: { fontFamily: theme.font.display, fontSize: 20, color: theme.color.cream, paddingVertical: 8 },
  bodyInput: { fontFamily: theme.font.bodyRegular, fontSize: 15, color: theme.color.cream, marginTop: 12, minHeight: 160, maxHeight: 280, lineHeight: 22 },
  label: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, marginTop: 24, marginBottom: 10 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 12, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15, borderWidth: 1, borderColor: theme.color.surface2 },
  // Linked spot and spot search
  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: theme.color.gold, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 16 },
  attachBtnText: { color: theme.color.gold, fontFamily: theme.font.body, fontSize: 13 },
  linkedSpotRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.color.surface2, padding: 10 },
  linkedSpotImage: { width: 32, height: 32, borderRadius: 6 },
  linkedSpotText: { flex: 1, fontFamily: theme.font.bodyRegular, fontSize: 13.5, color: theme.color.cream },
  spotSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  closeSearchBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' },
  noResultsText: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted, marginTop: 10 },
  spotResultsList: { maxHeight: 260, marginTop: 8 },
  spotResultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.color.surface2 },
  rowPressed: { opacity: 0.6 },
});
