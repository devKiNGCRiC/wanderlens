import { useState, useCallback } from 'react';
import { View, Text, Image, Pressable, FlatList, StyleSheet, Alert } from 'react-native';
import { useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ScreenBackground } from '@/components/ScreenBackground';
import { formatTimeAgo } from '@/lib/formatTimeAgo';

type Note = {
  id: string;
  title: string;
  body: string;
  spot_id: string | null;
  created_at: string;
  spots: { title: string; photo_url: string | null } | null;
};

export default function Notes() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    (async () => {
      if (!session) return;
      setLoading(true);
      const { data } = await supabase
        .from('notes')
        .select('id, title, body, spot_id, created_at, spots(title, photo_url)')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      setNotes((data as unknown as Note[]) ?? []);
      setLoading(false);
    })();
  }, [session]));

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

  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.heading}>Notes</Text>
        <Pressable onPress={() => router.push('/note-editor')} style={styles.addBtn} accessibilityLabel="New note">
          <Ionicons name="add" size={22} color={theme.color.dusk} />
        </Pressable>
      </View>

      <FlatList
        data={notes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        renderItem={({ item }) => (
          <Pressable style={styles.noteCard} onPress={() => router.push({ pathname: '/note-editor', params: { id: item.id } })}>
            <View style={styles.noteHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.noteTitle} numberOfLines={1}>{item.title}</Text>
                {!!item.body && <Text style={styles.noteBody} numberOfLines={2}>{item.body}</Text>}
              </View>
              <Pressable onPress={() => handleDelete(item.id)} style={styles.deleteIconBtn} accessibilityLabel="Delete note" hitSlop={9}>
                <Ionicons name="trash-outline" size={16} color={theme.color.ember} />
              </Pressable>
            </View>
            <View style={styles.noteFooter}>
              {item.spots && (
                <View style={styles.spotBadge}>
                  {item.spots.photo_url && <Image source={{ uri: item.spots.photo_url }} style={styles.spotBadgeImage} />}
                  <Text style={styles.spotBadgeText} numberOfLines={1}>{item.spots.title}</Text>
                </View>
              )}
              <Text style={styles.noteTime}>{formatTimeAgo(item.created_at)}</Text>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.emptyText}>No notes yet — jot down your next destination list, camera settings, or anything else worth remembering.</Text> : null}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center' },
  heading: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center' },
  noteCard: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, padding: 14, marginBottom: 12 },
  noteHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  noteTitle: { fontFamily: theme.font.body, fontSize: 15, color: theme.color.cream },
  noteBody: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted, marginTop: 4, lineHeight: 17 },
  deleteIconBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  noteFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  spotBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.color.mediaCasing, borderRadius: 14, paddingVertical: 4, paddingHorizontal: 8, flexShrink: 1 },
  spotBadgeImage: { width: 18, height: 18, borderRadius: 4 },
  spotBadgeText: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.gold, flexShrink: 1 },
  noteTime: { fontFamily: theme.font.mono, fontSize: 9, color: theme.color.muted },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', padding: 40, lineHeight: 19 },
});
