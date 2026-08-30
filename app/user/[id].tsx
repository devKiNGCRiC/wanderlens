import { useState, useCallback } from 'react';
import { View, Text, Image, Pressable, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { ImageViewer } from '@/components/ImageViewer';
import { flagEmoji, COUNTRIES } from '@/constants/countries';

type PublicProfile = {
  id: string; full_name: string | null; username: string | null; bio: string | null;
  avatar_url: string | null; banner_url: string | null; user_type: string | null;
  travel_style: string | null; home_city: string | null; country: string | null;
};
type Spot = { id: string; photo_url: string | null; genre: string | null };

function formatUserType(type: string | null) {
  if (type === 'both') return 'Traveler & Photographer';
  if (type === 'traveler') return 'Traveler';
  if (type === 'photographer') return 'Photographer';
  return null;
}

export default function PublicProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      if (!id) return;
      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', id).single();
      setProfile(profileData as PublicProfile);
      const { data: spotsData } = await supabase.from('spots').select('id, photo_url, genre').eq('created_by', id).order('created_at', { ascending: false });
      setSpots((spotsData as Spot[]) ?? []);
      setLoading(false);
    })();
  }, [id]));

  if (loading || !profile) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.center}><ActivityIndicator color={theme.color.gold} /></View>
      </>
    );
  }

  const initial = profile.full_name?.charAt(0)?.toUpperCase() || '?';
  const typeLabel = formatUserType(profile.user_type);
  const countryCode = COUNTRIES.find((c) => c.name === profile.country)?.code;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <FlatList
        style={styles.root}
        data={spots}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={{ paddingBottom: 60 }}
        ListHeaderComponent={
          <View>
            <View style={styles.banner}>
              {profile.banner_url ? <Image source={{ uri: profile.banner_url }} style={StyleSheet.absoluteFill} /> : <LinearGradient colors={['#C9683E', '#4B3F72', theme.color.dusk]} style={StyleSheet.absoluteFill} />}
              <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 10 }]}>
                <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
              </Pressable>
            </View>
            <View style={styles.header}>
              <Pressable onPress={() => profile.avatar_url && setViewerUri(profile.avatar_url)} style={styles.avatar}>
                {profile.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initial}</Text>}
              </Pressable>
              <Text style={styles.name}>{profile.full_name || 'Traveler'}</Text>
              {profile.username ? <Text style={styles.username}>@{profile.username}</Text> : null}
              {profile.country && <Text style={styles.country}>{countryCode ? flagEmoji(countryCode) : ''} {profile.country}</Text>}
              {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
              <View style={styles.tagsRow}>
                {typeLabel && <View style={styles.tag}><Text style={styles.tagText}>{typeLabel}</Text></View>}
                {profile.travel_style && <View style={styles.tag}><Text style={styles.tagText}>{profile.travel_style}</Text></View>}
                {profile.home_city && <View style={styles.tag}><Text style={styles.tagText}>📍 {profile.home_city}</Text></View>}
              </View>
              <View style={styles.connectBtn}>
                <Text style={styles.connectBtnText}>Connect — coming soon</Text>
              </View>
              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>Captures ({spots.length})</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.gridItem} onPress={() => router.push({ pathname: '/spot/[id]', params: { id: item.id } })}>
            <View style={styles.gridInner}>
              {item.photo_url ? <Image source={{ uri: item.photo_url }} style={styles.gridImage} /> : <View style={styles.gridFallback}><Ionicons name="camera-outline" size={18} color={theme.color.muted} /></View>}
            </View>
          </Pressable>
        )}
      />
      <ImageViewer visible={!!viewerUri} uri={viewerUri} onClose={() => setViewerUri(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.color.dusk },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.dusk },
  banner: { height: 140, backgroundColor: theme.color.surface },
  backBtn: { position: 'absolute', left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(20,23,31,0.55)', alignItems: 'center', justifyContent: 'center' },
  header: { padding: 24, paddingTop: 0 },
  avatar: { width: 88, height: 88, borderRadius: 44, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginTop: -44, borderWidth: 4, borderColor: theme.color.dusk },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontFamily: theme.font.display, fontSize: 30, color: theme.color.dusk },
  name: { fontFamily: theme.font.display, fontSize: 21, color: theme.color.cream, marginTop: 14 },
  username: { fontFamily: theme.font.mono, fontSize: 12, color: theme.color.gold, marginTop: 2 },
  country: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted, marginTop: 4 },
  bio: { fontFamily: theme.font.bodyRegular, fontSize: 13.5, color: theme.color.cream, marginTop: 10, lineHeight: 19 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  tag: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  tagText: { fontFamily: theme.font.bodyRegular, fontSize: 11.5, color: theme.color.muted },
  connectBtn: { marginTop: 18, backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, paddingVertical: 11, alignItems: 'center' },
  connectBtnText: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted },
  divider: { height: 1, backgroundColor: theme.color.surface2, marginTop: 24, marginBottom: 14 },
  sectionTitle: { fontFamily: theme.font.display, fontSize: 16, color: theme.color.cream },
  gridItem: { flex: 1 / 3, aspectRatio: 1, padding: 3 },
  gridInner: { flex: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: theme.color.surface2 },
  gridImage: { flex: 1 },
  gridFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});