import { useState, useEffect } from 'react';
import { View, Text, TextInput, Image, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAwareScrollView } from '@codler/react-native-keyboard-aware-scroll-view';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ScreenBackground } from '@/components/ScreenBackground';

type SpotRef = { id: string; title: string; photo_url: string | null };

export default function NoteEditor() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { id, spotId } = useLocalSearchParams<{ id?: string; spotId?: string }>();
  const isEditing = !!id;

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkedSpot, setLinkedSpot] = useState<SpotRef | null>(null);
  const [spotSearchOpen, setSpotSearchOpen] = useState(false);
  const [spotQuery, setSpotQuery] = useState('');
  const [spotResults, setSpotResults] = useState<SpotRef[]>([]);
  const [searching, setSearching] = useState(false);

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
          setLinkedSpot((data.spots as unknown as SpotRef) ?? null);
        }
        setLoading(false);
      } else if (spotId) {
        const { data } = await supabase.from('spots').select('id, title, photo_url').eq('id', spotId).maybeSingle();
        if (data) setLinkedSpot(data);
      }
    })();
  }, [id, isEditing, spotId]);

  async function searchSpots(query: string) {
    setSpotQuery(query);
    if (query.trim().length < 2) { setSpotResults([]); return; }
    setSearching(true);
    const { data } = await supabase.from('spots').select('id, title, photo_url').ilike('title', `%${query.trim()}%`).limit(10);
    setSpotResults(data ?? []);
    setSearching(false);
  }

  function selectSpot(spot: SpotRef) {
    setLinkedSpot(spot);
    setSpotSearchOpen(false);
    setSpotQuery('');
    setSpotResults([]);
  }

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
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.heading}>{isEditing ? 'Edit note' : 'New note'}</Text>
        {isEditing ? (
          <Pressable onPress={handleDelete} style={styles.backBtn} accessibilityLabel="Delete note">
            <Ionicons name="trash-outline" size={18} color={theme.color.ember} />
          </Pressable>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <KeyboardAwareScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" enableOnAndroid extraScrollHeight={28}>
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
            <TextInput
              style={styles.input}
              placeholder="Search spots by title"
              placeholderTextColor={theme.color.muted}
              value={spotQuery}
              onChangeText={searchSpots}
              autoFocus
            />
            {searching && <ActivityIndicator color={theme.color.gold} style={{ marginTop: 10 }} size="small" />}
            {spotResults.map((s) => (
              <Pressable key={s.id} onPress={() => selectSpot(s)} style={styles.spotResultRow}>
                {s.photo_url && <Image source={{ uri: s.photo_url }} style={styles.linkedSpotImage} />}
                <Text style={styles.linkedSpotText} numberOfLines={1}>{s.title}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Pressable onPress={() => setSpotSearchOpen(true)} style={styles.attachBtn}>
            <Ionicons name="location-outline" size={16} color={theme.color.gold} />
            <Text style={styles.attachBtnText}>Attach to a spot</Text>
          </Pressable>
        )}

        <Pressable style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.saveBtnText}>Save note</Text>}
        </Pressable>
      </KeyboardAwareScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' },
  heading: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  container: { padding: 24, paddingBottom: 60 },
  titleInput: { fontFamily: theme.font.display, fontSize: 20, color: theme.color.cream, paddingVertical: 8 },
  bodyInput: { fontFamily: theme.font.bodyRegular, fontSize: 15, color: theme.color.cream, marginTop: 12, minHeight: 160, lineHeight: 22 },
  label: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, marginTop: 24, marginBottom: 10 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 12, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15, borderWidth: 1, borderColor: theme.color.surface2 },
  attachBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: theme.color.gold, borderRadius: 20, paddingVertical: 9, paddingHorizontal: 16 },
  attachBtnText: { color: theme.color.gold, fontFamily: theme.font.body, fontSize: 13 },
  linkedSpotRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.color.surface2, padding: 10 },
  linkedSpotImage: { width: 32, height: 32, borderRadius: 6 },
  linkedSpotText: { flex: 1, fontFamily: theme.font.bodyRegular, fontSize: 13.5, color: theme.color.cream },
  spotResultRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.color.surface2 },
  saveBtn: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 32 },
  saveBtnText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
});
