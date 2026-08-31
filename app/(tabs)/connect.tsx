import { useState, useCallback } from 'react';
import { View, Text, Image, Pressable, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ScreenBackground } from '@/components/ScreenBackground';
import { formatUserType } from '@/lib/formatUserType';

const SEGMENTS = ['Discover', 'Requests', 'Connections'] as const;
type Segment = typeof SEGMENTS[number];
const GENRE_FILTERS = ['Street', 'Landscape', 'Portrait', 'Astro', 'Wildlife', 'Architecture', 'Travel'];

type Person = {
  id: string; username: string | null; full_name: string | null; avatar_url: string | null;
  user_type: string | null; photography_genres: string[] | null; home_city: string | null;
  connection_status: string; is_requester: boolean; connection_id: string | null;
  latest_photo_url: string | null; latest_spot_id: string | null;
};
type PersonRef = { id: string; username: string | null; full_name: string | null; avatar_url: string | null } | null;
type ConnectionRow = { id: string; requester_id: string; recipient_id: string; requester: PersonRef; recipient?: PersonRef };

function handleOf(p: { username?: string | null; full_name?: string | null }) {
  return p.username || p.full_name || 'traveler';
}

export default function ConnectScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [segment, setSegment] = useState<Segment>('Discover');
  const [people, setPeople] = useState<Person[]>([]);
  const [requests, setRequests] = useState<ConnectionRow[]>([]);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadDiscover(genre: string | null) {
    const { data, error } = await supabase.rpc('discover_people', { search_genre: genre });
    if (!error && data) setPeople(data as Person[]);
  }
  async function loadRequests() {
    if (!session) return;
    const { data } = await supabase
      .from('connections')
      .select('id, requester_id, recipient_id, requester:requester_id(id, username, full_name, avatar_url)')
      .eq('recipient_id', session.user.id)
      .eq('status', 'pending');
    setRequests((data as any) ?? []);
  }
  async function loadConnections() {
    if (!session) return;
    const { data } = await supabase
      .from('connections')
      .select('id, requester_id, recipient_id, requester:requester_id(id, username, full_name, avatar_url), recipient:recipient_id(id, username, full_name, avatar_url)')
      .or(`requester_id.eq.${session.user.id},recipient_id.eq.${session.user.id}`)
      .eq('status', 'accepted');
    setConnections((data as any) ?? []);
  }

  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadDiscover(genreFilter), loadRequests(), loadConnections()]);
      setLoading(false);
    })();
  }, [session]));

  async function sendRequest(recipientId: string) {
    if (!session) return;
    const { data, error } = await supabase.from('connections').insert({ requester_id: session.user.id, recipient_id: recipientId }).select('id').single();
    if (!error && data) setPeople((prev) => prev.map((p) => (p.id === recipientId ? { ...p, connection_status: 'pending', is_requester: true, connection_id: data.id } : p)));
  }
  async function cancelRequest(connectionId: string, personId: string) {
    setPeople((prev) => prev.map((p) => (p.id === personId ? { ...p, connection_status: 'none', connection_id: null } : p)));
    await supabase.from('connections').delete().eq('id', connectionId);
  }
  async function respondToRequest(id: string, accept: boolean) {
    if (accept) await supabase.from('connections').update({ status: 'accepted' }).eq('id', id);
    else await supabase.from('connections').delete().eq('id', id);
    loadRequests(); loadConnections(); loadDiscover(genreFilter);
  }
  function removeConnection(id: string) {
    Alert.alert('Remove connection?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await supabase.from('connections').delete().eq('id', id); loadConnections(); loadDiscover(genreFilter); } },
    ]);
  }
  function applyGenreFilter(g: string | null) { setGenreFilter(g); loadDiscover(g); }

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <Text style={styles.title}>Connect</Text>
        <View style={styles.segments}>
          {SEGMENTS.map((s) => (
            <Pressable key={s} onPress={() => setSegment(s)} style={[styles.segment, segment === s && styles.segmentActive]}>
              <Text style={[styles.segmentText, segment === s && styles.segmentTextActive]}>{s}</Text>
              {s === 'Requests' && requests.length > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{requests.length}</Text></View>}
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.color.gold} style={{ marginTop: 40 }} />
      ) : segment === 'Discover' ? (
        <FlatList
          data={people}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 110 }}
          ListHeaderComponent={
            <FlatList
              horizontal showsHorizontalScrollIndicator={false} data={['All', ...GENRE_FILTERS]} keyExtractor={(i) => i}
              contentContainerStyle={{ gap: 8, paddingBottom: 18 }}
              renderItem={({ item }) => (
                <Pressable onPress={() => applyGenreFilter(item === 'All' ? null : item)} style={[styles.filterChip, (genreFilter === item || (item === 'All' && !genreFilter)) && styles.filterChipActive]}>
                  <Text style={[styles.filterChipText, (genreFilter === item || (item === 'All' && !genreFilter)) && styles.filterChipTextActive]}>{item}</Text>
                </Pressable>
              )}
            />
          }
          renderItem={({ item }) => {
            const typeLabel = formatUserType(item.user_type);
            return (
              <View style={styles.personCard}>
                <View style={styles.cardTopRow}>
                  <Pressable style={styles.personInfo} onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.id } })}>
                    <View style={styles.avatarRing}>
                      <View style={styles.avatar}>
                        {item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{handleOf(item).charAt(0).toUpperCase()}</Text>}
                      </View>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.personName}>{handleOf(item)}</Text>
                      <Text style={styles.personMeta}>{[typeLabel, item.photography_genres?.[0]].filter(Boolean).join(' · ')}</Text>
                      {item.home_city && <Text style={styles.personCity}>📍 {item.home_city}</Text>}
                    </View>
                  </Pressable>
                  {item.latest_photo_url && item.latest_spot_id ? (
                    <Pressable style={styles.thumbWrap} onPress={() => router.push({ pathname: '/spot/[id]', params: { id: item.latest_spot_id! } })}>
                      <Image source={{ uri: item.latest_photo_url }} style={styles.thumb} />
                      <View style={styles.thumbCornerTL} /><View style={styles.thumbCornerBR} />
                    </Pressable>
                  ) : null}
                </View>

                {item.connection_status === 'none' && (
                  <Pressable onPress={() => sendRequest(item.id)} style={styles.connectBtn}><Text style={styles.connectBtnText}>Connect</Text></Pressable>
                )}
                {item.connection_status === 'pending' && item.is_requester && (
                  <Pressable onPress={() => item.connection_id && cancelRequest(item.connection_id, item.id)} style={styles.pendingBtn}><Text style={styles.pendingBtnText}>Cancel request</Text></Pressable>
                )}
                {item.connection_status === 'pending' && !item.is_requester && (
                  <Pressable onPress={() => setSegment('Requests')} style={styles.connectBtn}><Text style={styles.connectBtnText}>Respond</Text></Pressable>
                )}
                {item.connection_status === 'accepted' && (
                  <View style={styles.connectedBtn}><Ionicons name="checkmark" size={13} color={theme.color.gold} /><Text style={styles.connectedBtnText}>Connected</Text></View>
                )}
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptyText}>No one else here yet — share your profile QR to invite fellow travelers.</Text>}
        />
      ) : segment === 'Requests' ? (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 110 }}
          renderItem={({ item }) => (
            <View style={styles.personCard}>
              <Pressable style={styles.personInfo} onPress={() => item.requester && router.push({ pathname: '/user/[id]', params: { id: item.requester.id } })}>
                <View style={styles.avatarRing}>
                  <View style={styles.avatar}>
                    {item.requester?.avatar_url ? <Image source={{ uri: item.requester.avatar_url }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{handleOf(item.requester || {}).charAt(0).toUpperCase()}</Text>}
                  </View>
                </View>
                <Text style={styles.personName}>{handleOf(item.requester || {})}</Text>
              </Pressable>
              <View style={styles.respondRow}>
                <Pressable onPress={() => respondToRequest(item.id, true)} style={[styles.connectBtn, { flex: 1 }]}><Text style={styles.connectBtnText}>Accept</Text></Pressable>
                <Pressable onPress={() => respondToRequest(item.id, false)} style={[styles.pendingBtn, { flex: 1 }]}><Text style={styles.pendingBtnText}>Decline</Text></Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>No pending requests.</Text>}
        />
      ) : (
        <FlatList
          data={connections}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 110 }}
          renderItem={({ item }) => {
            const other = item.requester_id === session?.user.id ? item.recipient : item.requester;
            if (!other) return null;
            return (
              <View style={styles.personCard}>
                <View style={styles.cardTopRow}>
                  <Pressable style={styles.personInfo} onPress={() => router.push({ pathname: '/user/[id]', params: { id: other.id } })}>
                    <View style={styles.avatarRing}>
                      <View style={styles.avatar}>
                        {other.avatar_url ? <Image source={{ uri: other.avatar_url }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{handleOf(other).charAt(0).toUpperCase()}</Text>}
                      </View>
                    </View>
                    <Text style={styles.personName}>{handleOf(other)}</Text>
                  </Pressable>
                  <Pressable onPress={() => removeConnection(item.id)} style={styles.removeIconBtn}>
                    <Ionicons name="person-remove-outline" size={18} color={theme.color.ember} />
                  </Pressable>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.emptyText}>No connections yet — start in Discover.</Text>}
        />
      )}
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 8 },
  title: { fontFamily: theme.font.display, fontSize: 26, color: theme.color.cream, marginBottom: 18 },
  segments: { flexDirection: 'row', backgroundColor: theme.color.surface, borderRadius: 24, padding: 4, borderWidth: 1, borderColor: theme.color.surface2 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 20 },
  segmentActive: { backgroundColor: theme.color.gold },
  segmentText: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted },
  segmentTextActive: { fontFamily: theme.font.body, color: theme.color.dusk },
  badge: { backgroundColor: theme.color.ember, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { fontFamily: theme.font.body, fontSize: 9, color: theme.color.cream },
  filterChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.color.surface2, backgroundColor: theme.color.surface },
  filterChipActive: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  filterChipText: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.cream },
  filterChipTextActive: { fontFamily: theme.font.body, color: theme.color.dusk },
  personCard: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, padding: 12, marginBottom: 12 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  personInfo: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  avatarRing: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, borderColor: theme.color.gold, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontFamily: theme.font.display, fontSize: 15, color: theme.color.dusk },
  personName: { fontFamily: theme.font.body, fontSize: 14.5, color: theme.color.cream },
  personMeta: { fontFamily: theme.font.mono, fontSize: 10, color: theme.color.gold, marginTop: 3 },
  personCity: { fontFamily: theme.font.bodyRegular, fontSize: 10.5, color: theme.color.muted, marginTop: 2 },
  thumbWrap: { width: 50, height: 50, marginLeft: 10, position: 'relative' },
  thumb: { width: '100%', height: '100%', borderRadius: 10 },
  thumbCornerTL: { position: 'absolute', top: -2, left: -2, width: 10, height: 10, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderColor: theme.color.gold },
  thumbCornerBR: { position: 'absolute', bottom: -2, right: -2, width: 10, height: 10, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderColor: theme.color.gold },
  connectBtn: { marginTop: 12, backgroundColor: theme.color.gold, borderRadius: 20, paddingVertical: 9, alignItems: 'center' },
  connectBtnText: { fontFamily: theme.font.body, fontSize: 12.5, color: theme.color.dusk },
  pendingBtn: { marginTop: 12, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: 20, paddingVertical: 9, alignItems: 'center' },
  pendingBtnText: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted },
  connectedBtn: { marginTop: 12, flexDirection: 'row', gap: 5, borderWidth: 1, borderColor: theme.color.gold, borderRadius: 20, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  connectedBtnText: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.gold },
  respondRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  removeIconBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: theme.color.surface2, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', padding: 40 },
});