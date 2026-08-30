import { useState, useCallback } from 'react';
import { View, Text, Image, Pressable, StyleSheet, FlatList, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ImageViewer } from '@/components/ImageViewer';

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
  const [viewerUri, setViewerUri] = useState<string | null>(null);

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

  function handleSignOut() {
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  const initial = profile?.full_name?.charAt(0)?.toUpperCase() || '?';
  const typeLabel = formatUserType(profile?.user_type ?? null);

  return (
    <>
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
                <Pressable onPress={() => setViewerUri(profile.banner_url)} style={StyleSheet.absoluteFill}>
                  <Image source={{ uri: profile.banner_url }} style={StyleSheet.absoluteFill} />
                </Pressable>
              ) : (
                <LinearGradient colors={['#C9683E', '#4B3F72', theme.color.dusk]} style={StyleSheet.absoluteFill} />
              )}
              <LinearGradient colors={['transparent', theme.color.dusk]} style={styles.bannerScrim} />
              <Pressable onPress={handleSignOut} style={styles.signOutIcon}>
                <Ionicons name="log-out-outline" size={18} color={theme.color.cream} />
              </Pressable>
            </View>

            <View style={styles.header}>
              <Pressable onPress={() => profile?.avatar_url && setViewerUri(profile.avatar_url)} style={styles.avatar}>
                {profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>{initial}</Text>
                )}
              </Pressable>

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

              <Pressable onPress={() => router.push('/edit-profile')} style={styles.editBtn}>
                <Ionicons name="create-outline" size={15} color={theme.color.gold} />
                <Text style={styles.editBtnText}>Edit profile</Text>
              </Pressable>

              <View style={styles.divider} />
              <Text style={styles.sectionEyebrow}>GALLERY</Text>
              <View style={styles.sectionTitleRow}>
                <Text style={styles.sectionTitle}>Captures</Text>
                <Text style={styles.sectionCount}>{mySpots.length}</Text>
              </View>
              <Text style={styles.sectionHint}>Tap to open · hold to delete</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.gridItem, pressed && { opacity: 0.75 }]}
            onPress={() => router.push({ pathname: '/spot/[id]', params: { id: item.id } })}
          >
            <View style={styles.gridInner}>
              {item.photo_url ? (
                <Image source={{ uri: item.photo_url }} style={styles.gridImage} />
              ) : (
                <View style={styles.gridFallback}><Ionicons name="camera-outline" size={18} color={theme.color.muted} /></View>
              )}
              {item.genre && <View style={styles.gridBadge}><Text style={styles.gridBadgeText}>{item.genre}</Text></View>}
            </View>
          </Pressable>
        )}
        ListEmptyComponent={!loading ? <Text style={styles.emptyText}>No captures yet — add one from the Map tab.</Text> : null}
      />
      <ImageViewer visible={!!viewerUri} uri={viewerUri} onClose={() => setViewerUri(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.dusk },
  banner: { height: 160, backgroundColor: theme.color.surface },
  bannerScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 60 },
  signOutIcon: { position: 'absolute', top: 16, right: 16, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(20,23,31,0.55)', alignItems: 'center', justifyContent: 'center' },
  header: { padding: 24, paddingTop: 0 },
  avatar: { width: 92, height: 92, borderRadius: 46, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: -46, borderWidth: 4, borderColor: theme.color.dusk },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontFamily: theme.font.display, fontSize: 32, color: theme.color.dusk },
  name: { fontFamily: theme.font.display, fontSize: 23, color: theme.color.cream, marginTop: 14 },
  username: { fontFamily: theme.font.mono, fontSize: 12, color: theme.color.gold, marginTop: 3 },
  bio: { fontFamily: theme.font.bodyRegular, fontSize: 13.5, color: theme.color.cream, marginTop: 10, lineHeight: 19 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  tag: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  tagText: { fontFamily: theme.font.bodyRegular, fontSize: 11.5, color: theme.color.muted },
  genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  genreChip: { backgroundColor: 'rgba(232,166,76,0.12)', borderRadius: 14, paddingVertical: 4, paddingHorizontal: 10 },
  genreChipText: { fontFamily: theme.font.mono, fontSize: 10, color: theme.color.gold },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 18, borderWidth: 1, borderColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 11 },
  editBtnText: { fontFamily: theme.font.body, fontSize: 13.5, color: theme.color.gold },
  divider: { height: 1, backgroundColor: theme.color.surface2, marginTop: 26, marginBottom: 16 },
  sectionEyebrow: { fontFamily: theme.font.mono, fontSize: 10, letterSpacing: 1.5, color: theme.color.muted },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  sectionTitle: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  sectionCount: { fontFamily: theme.font.mono, fontSize: 13, color: theme.color.gold },
  sectionHint: { fontFamily: theme.font.bodyRegular, fontSize: 11, color: theme.color.muted, marginTop: 3 },
  gridItem: { flex: 1 / 3, aspectRatio: 1, padding: 3 },
  gridInner: { flex: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: theme.color.surface2 },
  gridImage: { flex: 1 },
  gridFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  gridBadge: { position: 'absolute', bottom: 5, left: 5, backgroundColor: 'rgba(20,23,31,0.75)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  gridBadgeText: { fontFamily: theme.font.mono, fontSize: 8, color: theme.color.gold },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', padding: 24 },
});