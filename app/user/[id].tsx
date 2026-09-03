import { useState, useCallback } from 'react';
import { View, Text, Image, Pressable, StyleSheet, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ImageViewer } from '@/components/ImageViewer';
import { ActionSheet } from '@/components/ActionSheet';
import { ScreenBackground } from '@/components/ScreenBackground';
import { PolaroidGridItem, rotationFor } from '@/components/PolaroidGridItem';
import { flagEmoji, COUNTRIES } from '@/constants/countries';
import { formatUserType } from '@/lib/formatUserType';

type PublicProfile = {
  id: string; full_name: string | null; username: string | null; bio: string | null;
  avatar_url: string | null; banner_url: string | null; user_type: string | null;
  travel_style: string | null; home_city: string | null; country: string | null;
  photography_genres: string[] | null; place_interests: string[] | null;
};
type Spot = { id: string; photo_url: string | null; genre: string | null };
type ConnState = { id: string | null; status: 'none' | 'pending' | 'accepted'; isRequester: boolean };

export default function PublicProfile() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [conn, setConn] = useState<ConnState>({ id: null, status: 'none', isRequester: false });
  const [loading, setLoading] = useState(true);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [messaging, setMessaging] = useState(false);
  const [myBlocked, setMyBlocked] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    if (session && id === session.user.id) {
      router.replace('/(tabs)/profile');
      return;
    }
    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', id).single();
    setProfile(profileData as PublicProfile);
    const { data: spotsData } = await supabase.from('spots').select('id, photo_url, genre').eq('created_by', id).order('created_at', { ascending: false });
    setSpots((spotsData as Spot[]) ?? []);

    if (session) {
      type ConnRow = { id: string; status: string; is_requester: boolean };
      const { data: connData } = await supabase.rpc('get_connection_status', { other_id: id }).maybeSingle() as { data: ConnRow | null };
      if (connData) setConn({ id: connData.id, status: connData.status as any, isRequester: connData.is_requester });
      else setConn({ id: null, status: 'none', isRequester: false });

      const { data: blockRow } = await supabase.from('blocked_users').select('id').eq('blocker_id', session.user.id).eq('blocked_id', id).maybeSingle();
      setMyBlocked(!!blockRow);
    }
    setLoading(false);
  }, [id, session]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function sendRequest() {
    if (!session || !id) return;
    const { data } = await supabase.from('connections').insert({ requester_id: session.user.id, recipient_id: id }).select('id').single();
    if (data) setConn({ id: data.id, status: 'pending', isRequester: true });
  }
  async function cancelRequest() {
    if (!conn.id) return;
    await supabase.from('connections').delete().eq('id', conn.id);
    setConn({ id: null, status: 'none', isRequester: false });
  }
  async function respond(accept: boolean) {
    if (!conn.id) return;
    if (accept) { await supabase.from('connections').update({ status: 'accepted' }).eq('id', conn.id); setConn((c) => ({ ...c, status: 'accepted' })); }
    else { await supabase.from('connections').delete().eq('id', conn.id); setConn({ id: null, status: 'none', isRequester: false }); }
  }
  async function removeConnection() {
    if (!conn.id) return;
    await supabase.from('connections').delete().eq('id', conn.id);
    setConn({ id: null, status: 'none', isRequester: false });
  }
  async function messageUser() {
    if (!session || !id || messaging) return;
    setMessaging(true);
    const { data, error } = await supabase.rpc('get_or_create_direct_conversation', { other_user_id: id });
    setMessaging(false);
    if (!error && data) router.push({ pathname: '/chat/[id]', params: { id: data as string } });
  }
  function toggleBlock() {
    if (!session || !id) return;
    if (myBlocked) {
      supabase.from('blocked_users').delete().eq('blocker_id', session.user.id).eq('blocked_id', id).then(() => setMyBlocked(false));
      return;
    }
    Alert.alert(`Block ${profile?.username || profile?.full_name || 'this person'}?`, "They won't be able to message you.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: async () => { await supabase.from('blocked_users').insert({ blocker_id: session.user.id, blocked_id: id }); setMyBlocked(true); } },
    ]);
  }
  async function submitReport(reason: string) {
    if (!id) return;
    await supabase.rpc('report_content', { p_target_type: 'user', p_target_id: id, p_reason: reason });
    Alert.alert('Reported', "Thanks — we'll review this.");
  }
  function openMenu() {
    setMenuVisible(true);
  }

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
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      <FlatList
        data={spots}
        keyExtractor={(item) => item.id}
        numColumns={3}
        contentContainerStyle={{ paddingBottom: 60 }}
        ListHeaderComponent={
          <View>
            <View style={styles.banner}>
              {profile.banner_url ? <Image source={{ uri: profile.banner_url }} style={StyleSheet.absoluteFill} /> : <LinearGradient colors={['#C9683E', '#4B3F72', 'transparent']} style={StyleSheet.absoluteFill} />}
              <Pressable onPress={() => router.back()} style={[styles.backBtn, { top: insets.top + 10 }]}>
                <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
              </Pressable>
              <Pressable onPress={openMenu} style={[styles.menuBtn, { top: insets.top + 10 }]}>
                <Ionicons name="ellipsis-horizontal" size={20} color={theme.color.cream} />
              </Pressable>
            </View>
            <View style={styles.header}>
              <Pressable onPress={() => profile.avatar_url && setViewerUri(profile.avatar_url)} style={styles.avatarRing}>
                <View style={styles.avatar}>
                  {profile.avatar_url ? <Image source={{ uri: profile.avatar_url }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initial}</Text>}
                </View>
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
              {!!profile.photography_genres?.length && (
                <View style={styles.genreRow}>
                  {profile.photography_genres.map((g) => <View key={g} style={styles.genreChip}><Text style={styles.genreChipText}>{g}</Text></View>)}
                </View>
              )}
              {!!profile.place_interests?.length && (
                <View style={styles.genreRow}>
                  {profile.place_interests.map((p) => <View key={p} style={styles.placeChip}><Text style={styles.placeChipText}>{p}</Text></View>)}
                </View>
              )}

              {conn.status === 'none' && (
                <Pressable onPress={sendRequest} style={styles.connectBtn}><Ionicons name="person-add-outline" size={15} color={theme.color.dusk} /><Text style={styles.connectBtnText}>Connect</Text></Pressable>
              )}
              {conn.status === 'pending' && conn.isRequester && (
                <Pressable onPress={cancelRequest} style={styles.pendingBtn}><Text style={styles.pendingBtnText}>Cancel request</Text></Pressable>
              )}
              {conn.status === 'pending' && !conn.isRequester && (
                <View style={styles.respondRow}>
                  <Pressable onPress={() => respond(true)} style={[styles.connectBtn, { flex: 1 }]}><Text style={styles.connectBtnText}>Accept</Text></Pressable>
                  <Pressable onPress={() => respond(false)} style={[styles.pendingBtn, { flex: 1 }]}><Text style={styles.pendingBtnText}>Decline</Text></Pressable>
                </View>
              )}
              {conn.status === 'accepted' && (
                <View style={styles.respondRow}>
                  <View style={[styles.connectedBtn, { flex: 1 }]}><Ionicons name="checkmark" size={14} color={theme.color.gold} /><Text style={styles.connectedBtnText}>Connected</Text></View>
                  <Pressable onPress={removeConnection} style={styles.removeBtn}><Ionicons name="person-remove-outline" size={18} color={theme.color.ember} /></Pressable>
                </View>
              )}

              <Pressable onPress={messageUser} disabled={messaging || myBlocked} style={[styles.messageBtn, myBlocked && styles.messageBtnDisabled]}>
                {messaging ? (
                  <ActivityIndicator size="small" color={theme.color.gold} />
                ) : myBlocked ? (
                  <Text style={styles.messageBtnText}>You blocked this person</Text>
                ) : (
                  <>
                    <Ionicons name="chatbubble-outline" size={15} color={theme.color.gold} />
                    <Text style={styles.messageBtnText}>Message</Text>
                  </>
                )}
              </Pressable>

              <View style={styles.divider} />
              <Text style={styles.sectionTitle}>Captures ({spots.length})</Text>
            </View>
          </View>
        }
        renderItem={({ item, index }) => (
          <PolaroidGridItem photoUrl={item.photo_url} caption={item.genre} rotate={rotationFor(index)} onPress={() => router.push({ pathname: '/spot/[id]', params: { id: item.id } })} />
        )}
      />
      <ImageViewer visible={!!viewerUri} uri={viewerUri} onClose={() => setViewerUri(null)} />

      <ActionSheet
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        title={profile.username || profile.full_name || 'traveler'}
        options={[
          { key: 'block', label: myBlocked ? 'Unblock' : 'Block', icon: myBlocked ? 'lock-open-outline' : 'lock-closed-outline', destructive: !myBlocked, onPress: toggleBlock },
          { key: 'report', label: 'Report', icon: 'flag-outline', destructive: true, onPress: () => setReportSheetVisible(true) },
        ]}
      />

      <ActionSheet
        visible={reportSheetVisible}
        onClose={() => setReportSheetVisible(false)}
        title="Report this person?"
        options={[
          { key: 'spam', label: 'Spam', onPress: () => submitReport('spam') },
          { key: 'harassment', label: 'Harassment', onPress: () => submitReport('harassment') },
          { key: 'inappropriate', label: 'Inappropriate content', onPress: () => submitReport('inappropriate_content') },
          { key: 'other', label: 'Other', onPress: () => submitReport('other') },
        ]}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.color.dusk },
  banner: { height: 140, backgroundColor: theme.color.surface },
  backBtn: { position: 'absolute', left: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(20,23,31,0.55)', alignItems: 'center', justifyContent: 'center' },
  menuBtn: { position: 'absolute', right: 16, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(20,23,31,0.55)', alignItems: 'center', justifyContent: 'center' },
  header: { padding: 24, paddingTop: 0 },
  avatarRing: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: theme.color.gold, alignItems: 'center', justifyContent: 'center', marginTop: -48, backgroundColor: theme.color.dusk },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { fontFamily: theme.font.display, fontSize: 28, color: theme.color.dusk },
  name: { fontFamily: theme.font.display, fontSize: 21, color: theme.color.cream, marginTop: 14 },
  username: { fontFamily: theme.font.mono, fontSize: 12, color: theme.color.gold, marginTop: 2 },
  country: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted, marginTop: 4 },
  bio: { fontFamily: theme.font.bodyRegular, fontSize: 13.5, color: theme.color.cream, marginTop: 10, lineHeight: 19 },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  tag: { backgroundColor: theme.color.surface, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 12 },
  tagText: { fontFamily: theme.font.bodyRegular, fontSize: 11.5, color: theme.color.muted },
  genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  genreChip: { backgroundColor: 'rgba(232,166,76,0.12)', borderRadius: 14, paddingVertical: 4, paddingHorizontal: 10 },
  genreChipText: { fontFamily: theme.font.mono, fontSize: 10, color: theme.color.gold },
  placeChip: { backgroundColor: 'rgba(75,63,114,0.25)', borderRadius: 14, paddingVertical: 4, paddingHorizontal: 10 },
  placeChipText: { fontFamily: theme.font.mono, fontSize: 10, color: '#B7A9E0' },
  connectBtn: { flexDirection: 'row', gap: 7, marginTop: 18, backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  connectBtnText: { fontFamily: theme.font.body, fontSize: 13.5, color: theme.color.dusk },
  pendingBtn: { marginTop: 18, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, paddingVertical: 12, alignItems: 'center' },
  pendingBtnText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted },
  connectedBtn: { flexDirection: 'row', gap: 6, borderWidth: 1, borderColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  connectedBtnText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.gold },
  removeBtn: { width: 44, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  messageBtn: { flexDirection: 'row', gap: 7, marginTop: 10, borderWidth: 1, borderColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  messageBtnDisabled: { borderColor: theme.color.surface2 },
  messageBtnText: { fontFamily: theme.font.body, fontSize: 13.5, color: theme.color.gold },
  respondRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  divider: { height: 1, backgroundColor: theme.color.surface2, marginTop: 24, marginBottom: 14 },
  sectionTitle: { fontFamily: theme.font.display, fontSize: 16, color: theme.color.cream },
});