import { useState, useCallback } from 'react';
import { View, Text, Image, Pressable, StyleSheet, FlatList, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';

type MySpot = { id: string; title: string; photo_url: string | null; genre: string | null };

function formatUserType(type: string | null) {
  if (type === 'both') return 'Traveler & Photographer';
  if (type === 'traveler') return 'Traveler';
  if (type === 'photographer') return 'Photographer';
  return null;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { session, profile, signOut } = useAuth();
  const [mySpots, setMySpots] = useState<MySpot[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        if (!session) return;
        const { data, error } = await supabase
          .from('spots')
          .select('id, title, photo_url, genre')
          .eq('created_by', session.user.id)
          .order('created_at', { ascending: false });
        if (!error && data) setMySpots(data as MySpot[]);
        setLoading(false);
      })();
    }, [session])
  );

  function handleDeleteSpot(id: string) {
    Alert.alert('Delete this spot?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('spots').delete().eq('id', id);
          if (error) Alert.alert('Could not delete', error.message);
          else setMySpots((prev) => prev.filter((s) => s.id !== id));
        },
      },
    ]);
  }

  function handleSignOut() {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  const initial = profile?.full_name?.charAt(0)?.toUpperCase() || '?';
  const typeLabel = formatUserType(profile?.user_type ?? null);

  return (
    <FlatList
      style={styles.root}
      data={mySpots}
      keyExtractor={(item) => item.id}
      numColumns={3}
      contentContainerStyle={{ paddingBottom: 110 }}
      ListHeaderComponent={
        <View>
          <View style={styles.banner}>
            {profile?.banner_url ? (
              <Image source={{ uri: profile.banner_url }} style={StyleSheet.absoluteFill} />
            ) : (
              <LinearGradient colors={['#C9683E', '#4B3F72', theme.color.dusk]} style={StyleSheet.absoluteFill} />
            )}
          </View>

          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.avatar}>
                {profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>{initial}</Text>
                )}
              </View>
              <View style={styles.headerActions}>
                <Pressable onPress={() => router.push('/edit-profile')} style={styles.iconBtn}>
                  <Ionicons name="create-outline" size={20} color={theme.color.cream} />
                </Pressable>
                <Pressable onPress={handleSignOut} style={styles.iconBtn}>
                  <Ionicons name="log-out-outline" size={20} color={theme.color.ember} />
                </Pressable>
              </View>
            </View>

            <Text style={styles.name}>{profile?.full_name || 'Traveler'}</Text>
            {profile?.username ? <Text style={styles.username}>@{profile.username}</Text> : null}
            {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

            <View style={styles.tagsRow}>
              {typeLabel && <View style={styles.tag}><Text style={styles.tagText}>{typeLabel}</Text></View>}
              {profile?.travel_style && <View style={styles.tag}><Text style={styles.tagText}>{profile.travel_style}</Text></View>}
              {profile?.home_city && <View style={styles.tag}><Text style={styles.tagText}>📍 {profile.home_city}</Text></View>}
            </View>

            {!!profile?.photography_genres?.length && (
              <View style={styles.genreRow}>
                {profile.photography_genres.map((g) => (
                  <View key={g} style={styles.genreChip}><Text style={styles.genreChipText}>{g}</Text></View>
                ))}
              </View>
            )}

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>My spots ({mySpots.length})</Text>
            <Text style={styles.sectionHint}>Tap to view · hold to delete</Text>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable style={({ pressed }) => [styles.gridItem, pressed && { opacity: 0.75 }]} onLongPress={() => handleDeleteSpot(item.id)}>
          <View style={styles.gridInner}>
            {item.photo_url ? (
              <Image source={{ uri: item.photo_url }} style={styles.gridImage} />
            ) : (
              <View style={styles.gridFallback}><Ionicons name="camera-outline" size={18} color={theme.color.muted} /></View>
            )}
            {item.genre && (
              <View style={styles.gridBadge}><Text style={styles.gridBadgeText}>{item.genre}</Text></View>
            )}
          </View>
        </Pressable>
      )}
      ListEmptyComponent={!loading ? <Text style={styles.emptyText}>No spots posted yet — add one from the Map tab.</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.dusk },
  banner: { height: 130, backgroundColor: theme.color.surface },
  header: { padding: 24, paddingTop: 0 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: -42, borderWidth: 4, borderColor: theme.color.dusk },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontFamily: theme.font.display, fontSize: 30, color: theme.color.dusk },
  headerActions: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.color.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.color.surface2 },
  name: { fontFamily: theme.font.display, fontSize: 22, color: theme.color.cream, marginTop: 14 },
  username: { fontFamily: theme.font.mono, fontSize: 12, color: theme.color.gold, marginTop: 2 },
  bio: { fontFamily: theme.font.bodyRegular, fontSize: 13.5, color: theme.color.cream, marginTop: 10, lineHeight: 19 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  tag: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  tagText: { fontFamily: theme.font.bodyRegular, fontSize: 11.5, color: theme.color.muted },
  genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  genreChip: { backgroundColor: 'rgba(232,166,76,0.12)', borderRadius: 14, paddingVertical: 4, paddingHorizontal: 10 },
  genreChipText: { fontFamily: theme.font.mono, fontSize: 10, color: theme.color.gold },
  divider: { height: 1, backgroundColor: theme.color.surface2, marginTop: 22, marginBottom: 14 },
  sectionTitle: { fontFamily: theme.font.display, fontSize: 15, color: theme.color.cream },
  sectionHint: { fontFamily: theme.font.bodyRegular, fontSize: 11, color: theme.color.muted, marginTop: 2, marginBottom: 4 },
  gridItem: { flex: 1 / 3, aspectRatio: 1, padding: 3 },
  gridInner: { flex: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: theme.color.surface2 },
  gridImage: { flex: 1 },
  gridFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gridBadge: { position: 'absolute', bottom: 5, left: 5, backgroundColor: 'rgba(20,23,31,0.75)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  gridBadgeText: { fontFamily: theme.font.mono, fontSize: 8, color: theme.color.gold },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', padding: 24 },
});