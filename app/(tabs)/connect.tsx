/**
 * Route: /connect, the Connect tab: finding and managing travel connections.
 *
 * Purpose: pillar 2 of the app's thesis, meeting travelers/photographers by
 * genre or shared trip. Connections are mutual and both-sides-agreed (no
 * follower model, by design; see CLAUDE.md). Four segments:
 * - Discover: people from the `discover_people` RPC, filterable by genre.
 * - Trip: people whose trip destinations and dates overlap the user's own.
 * - Requests: incoming pending requests to accept or decline.
 * - Connections: accepted connections, removable.
 * Reachable under guard 2 in app/_layout.tsx.
 *
 * How it works:
 * - All four lists reload in parallel on every focus (useFocusEffect).
 * - Connection lifecycle is plain writes to the `connections` table: insert
 *   (request, status defaults to pending), update to 'accepted', or delete
 *   (cancel / decline / remove). Row Level Security (RLS), Postgres's
 *   per-row access rules, decides which of these writes are allowed.
 * - Connection events also create `notifications` rows via database
 *   triggers, which is how the other person hears about them.
 * - A `segment` route param (sent by the notification bell) picks the
 *   segment to open on.
 * - Deleted/anonymised accounts are filtered out of suggestion lists with
 *   excludeDeletedProfiles (lib/profiles.ts).
 */
import { useState, useCallback, useEffect } from 'react';
import { View, Text, Image, Pressable, FlatList, StyleSheet, Alert } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ScreenBackground } from '@/components/ScreenBackground';
import { formatUserType } from '@/lib/formatUserType';
import { excludeDeletedProfiles } from '@/lib/profiles';
import { PersonCardSkeletonList } from '@/components/skeletons/PersonCardSkeleton';

// Segment tabs, in display order. `as const` makes each name a literal type,
// so `Segment` below is the union 'Discover' | 'Trip' | 'Requests' | 'Connections'.
const SEGMENTS = ['Discover', 'Trip', 'Requests', 'Connections'] as const;
type Segment = typeof SEGMENTS[number];
// Genre chips shown above the Discover list (an "All" chip is added in front).
const GENRE_FILTERS = ['Street', 'Landscape', 'Portrait', 'Astro', 'Wildlife', 'Architecture', 'Travel'];

/**
 * A suggested person in Discover or Trip, plus the viewer's connection state
 * with them. Discover rows come from the discover_people RPC; Trip rows are
 * built client-side in loadTripMatches with the same shape.
 * connection_status: 'none' | 'pending' | 'accepted'. is_requester: true when
 * the viewer sent the pending request.
 */
type Person = {
  id: string; username: string | null; full_name: string | null; avatar_url: string | null;
  user_type: string | null; photography_genres: string[] | null; home_city: string | null;
  connection_status: string; is_requester: boolean; connection_id: string | null;
  latest_photo_url: string | null; latest_spot_id: string | null;
};
/** A profile embedded in a connections query (null if the join found nothing). */
type PersonRef = { id: string; username: string | null; full_name: string | null; avatar_url: string | null } | null;
/**
 * One row of the `connections` table with the requester's (and, for the
 * Connections list, the recipient's) profile joined in.
 */
type ConnectionRow = { id: string; requester_id: string; recipient_id: string; requester: PersonRef; recipient?: PersonRef };

/** Display name for a person: username, else full name, else 'traveler'. */
function handleOf(p: { username?: string | null; full_name?: string | null }) {
  return p.username || p.full_name || 'traveler';
}

/** Connect tab screen component (default export = the route). */
export default function ConnectScreen() {
  const router = useRouter();
  const { session, profile } = useAuth();
  const { segment: paramSegment } = useLocalSearchParams<{ segment?: string }>();
  const [segment, setSegment] = useState<Segment>('Discover');

  // The notification bell deep-links here with a `segment` param (e.g. tapping
  // a "connect_accepted" notification should land on Connections, not whatever
  // segment happened to be active) — this tab stays mounted between visits, so
  // a plain useState initializer alone wouldn't pick up a later navigation.
  useEffect(() => {
    if (paramSegment && (SEGMENTS as readonly string[]).includes(paramSegment)) {
      setSegment(paramSegment as Segment);
    }
  }, [paramSegment]);
  // One list per segment, the active Discover genre chip (null = All), and
  // the first-load flag that shows skeletons.
  const [people, setPeople] = useState<Person[]>([]);
  const [tripMatches, setTripMatches] = useState<Person[]>([]);
  const [requests, setRequests] = useState<ConnectionRow[]>([]);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Discover list: calls the discover_people RPC (optionally filtered by
   * genre), which already includes each person's connection status and
   * latest spot photo, then drops deleted accounts. On error the list is
   * left unchanged.
   */
  async function loadDiscover(genre: string | null) {
    const { data, error } = await supabase.rpc('discover_people', { search_genre: genre });
    if (error || !data) return;
    setPeople(await excludeDeletedProfiles(data as Person[]));
  }
  /**
   * Trip list: people whose planned trip shares at least one destination
   * with the viewer's and whose dates overlap. Empty when the viewer's own
   * profile has no complete trip (destinations + start + end date).
   */
  async function loadTripMatches() {
    // Guard: without a full trip on the viewer's profile there is nothing to match.
    if (!session || !profile?.trip_destinations?.length || !profile.trip_start_date || !profile.trip_end_date) {
      setTripMatches([]);
      return;
    }
    // A plain profiles select rather than extending discover_people — that
    // RPC's SQL isn't in this repo (applied live against Supabase, not
    // tracked in migrations), so its exact candidate-pool scoping is
    // unknown. This is lower-risk and doesn't depend on guessing it.
    // `overlaps` is an exact array-element match (destinations are stored
    // trimmed + lowercased on save) — not fuzzy, e.g. "paris" won't match
    // "paris, france"; real spelling/format consistency is a planned
    // follow-up (place autocomplete), not solved here.
    // Date overlap: two ranges overlap when each starts on or before the
    // other ends, hence their start <= my end AND their end >= my start.
    // The viewer and deleted accounts are excluded.
    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, user_type, photography_genres, home_city')
      .overlaps('trip_destinations', profile.trip_destinations)
      .lte('trip_start_date', profile.trip_end_date)
      .gte('trip_end_date', profile.trip_start_date)
      .neq('id', session.user.id)
      .is('deleted_at', null);
    if (!data) { setTripMatches([]); return; }

    // Shape returned by the get_connection_status RPC.
    type ConnRow = { id: string; status: string; is_requester: boolean };
    // A plain profiles select has no connection info, so look up the
    // viewer's status with each match (one RPC per match, run in parallel)
    // and fill the Person fields that Discover rows get from their RPC.
    // Trip rows have no latest photo, so the thumbnail is not shown for them.
    const withStatus = await Promise.all(
      data.map(async (row): Promise<Person> => {
        const { data: connData } = await supabase.rpc('get_connection_status', { other_id: row.id }).maybeSingle() as { data: ConnRow | null };
        return {
          ...row,
          latest_photo_url: null,
          latest_spot_id: null,
          connection_status: connData?.status ?? 'none',
          is_requester: connData?.is_requester ?? false,
          connection_id: connData?.id ?? null,
        };
      })
    );
    setTripMatches(withStatus);
  }
  /**
   * Requests list: pending connections sent TO the viewer. The
   * `requester:requester_id(...)` select syntax is a PostgREST embedded join
   * that pulls in the requester's profile through the foreign key.
   */
  async function loadRequests() {
    if (!session) return;
    const { data } = await supabase
      .from('connections')
      .select('id, requester_id, recipient_id, requester:requester_id(id, username, full_name, avatar_url)')
      .eq('recipient_id', session.user.id)
      .eq('status', 'pending');
    setRequests((data as any) ?? []);
  }
  /**
   * Connections list: accepted connections where the viewer is either side
   * (the `.or(...)` filter), with both profiles joined so the render can
   * show whichever person is not the viewer.
   */
  async function loadConnections() {
    if (!session) return;
    const { data } = await supabase
      .from('connections')
      .select('id, requester_id, recipient_id, requester:requester_id(id, username, full_name, avatar_url), recipient:recipient_id(id, username, full_name, avatar_url)')
      .or(`requester_id.eq.${session.user.id},recipient_id.eq.${session.user.id}`)
      .eq('status', 'accepted');
    setConnections((data as any) ?? []);
  }

  // Reload all four lists in parallel whenever the tab gains focus. The
  // tab stays mounted between visits, so useEffect alone would show stale
  // data. Re-subscribes when the session or the viewer's trip changes.
  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadDiscover(genreFilter), loadTripMatches(), loadRequests(), loadConnections()]);
      setLoading(false);
    })();
  }, [session, profile?.trip_destinations, profile?.trip_start_date, profile?.trip_end_date]));

  /**
   * Sends a connection request by inserting a `connections` row. After the
   * insert succeeds, the person is patched to 'pending' (with the new row
   * id, needed for cancel) in both the Discover and Trip lists, since the
   * same person can appear in both.
   */
  async function sendRequest(recipientId: string) {
    if (!session) return;
    const { data, error } = await supabase.from('connections').insert({ requester_id: session.user.id, recipient_id: recipientId }).select('id').single();
    if (!error && data) {
      const patch = (p: Person) => (p.id === recipientId ? { ...p, connection_status: 'pending', is_requester: true, connection_id: data.id } : p);
      setPeople((prev) => prev.map(patch));
      setTripMatches((prev) => prev.map(patch));
    }
  }
  /**
   * Withdraws a request the viewer sent: optimistically resets the person
   * to 'none' in both lists, then deletes the row. The delete's result is
   * not checked.
   */
  async function cancelRequest(connectionId: string, personId: string) {
    const patch = (p: Person) => (p.id === personId ? { ...p, connection_status: 'none', connection_id: null } : p);
    setPeople((prev) => prev.map(patch));
    setTripMatches((prev) => prev.map(patch));
    await supabase.from('connections').delete().eq('id', connectionId);
  }
  /**
   * Accept (status -> 'accepted') or decline (delete the row) an incoming
   * request, then refetch every list, since the person's status shows in all
   * of them. The refetches are fired without awaiting.
   */
  async function respondToRequest(id: string, accept: boolean) {
    if (accept) await supabase.from('connections').update({ status: 'accepted' }).eq('id', id);
    else await supabase.from('connections').delete().eq('id', id);
    loadRequests(); loadConnections(); loadDiscover(genreFilter); loadTripMatches();
  }
  /** Confirms, then deletes an accepted connection and refetches the affected lists. */
  function removeConnection(id: string) {
    Alert.alert('Remove connection?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await supabase.from('connections').delete().eq('id', id); loadConnections(); loadDiscover(genreFilter); loadTripMatches(); } },
    ]);
  }
  /** Genre chip tap: store the choice and reload Discover with it (null = All). */
  function applyGenreFilter(g: string | null) { setGenreFilter(g); loadDiscover(g); }

  // Shared by Discover and Trip — same row shape, same connection actions.
  /**
   * Renders one person card: avatar, name, "type · genre" line, home city,
   * an optional latest-spot thumbnail (framed with viewfinder corners), and
   * the action button that matches the connection state.
   */
  function renderPersonCard(item: Person) {
    const typeLabel = formatUserType(item.user_type);
    // Action button by state:
    //   none                    -> Connect (send request)
    //   pending, viewer sent it -> Cancel request
    //   pending, they sent it   -> Respond (jumps to the Requests segment)
    //   accepted                -> static "Connected" label
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
  }

  // Whether the viewer has a complete trip; picks the Trip empty-state message.
  const hasTrip = !!(profile?.trip_destinations?.length && profile?.trip_start_date && profile?.trip_end_date);

  return (
    <ScreenBackground>
      {/* Header: title and the segmented control. Requests shows a count badge. */}
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

      {/* Body: skeletons while loading, otherwise one FlatList per segment
          (Discover, Trip, Requests, Connections, in that order below). */}
      {loading ? (
        <View style={{ padding: 20 }}><PersonCardSkeletonList /></View>
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
          renderItem={({ item }) => renderPersonCard(item)}
          ListEmptyComponent={<Text style={styles.emptyText}>No one else here yet — share your profile QR to invite fellow travelers.</Text>}
        />
      ) : segment === 'Trip' ? (
        <FlatList
          data={tripMatches}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 20, paddingBottom: 110 }}
          renderItem={({ item }) => renderPersonCard(item)}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {hasTrip
                ? 'No travel matches yet for your trip — check back soon.'
                : 'Add your travel dates in Edit Profile to find people going the same place.'}
            </Text>
          }
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
            // Show the person on the other side of the connection, whichever
            // side the viewer is on. Skip the row if that profile is missing.
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

// Styles use design tokens (colors, fonts, radii) from constants/theme.ts.
const styles = StyleSheet.create({
  // Header and segmented control
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 8 },
  title: { fontFamily: theme.font.display, fontSize: 26, color: theme.color.cream, marginBottom: 18 },
  segments: { flexDirection: 'row', backgroundColor: theme.color.surface, borderRadius: 24, padding: 4, borderWidth: 1, borderColor: theme.color.surface2 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 20 },
  segmentActive: { backgroundColor: theme.color.gold },
  segmentText: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted },
  segmentTextActive: { fontFamily: theme.font.body, color: theme.color.dusk },
  badge: { backgroundColor: theme.color.ember, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { fontFamily: theme.font.body, fontSize: 9, color: theme.color.cream },
  // Discover genre chips
  filterChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: theme.color.surface2, backgroundColor: theme.color.surface },
  filterChipActive: { backgroundColor: theme.color.gold, borderColor: theme.color.gold },
  filterChipText: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.cream },
  filterChipTextActive: { fontFamily: theme.font.body, color: theme.color.dusk },
  // Person card, avatar and latest-spot thumbnail with viewfinder corners
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
  // Connection action buttons and empty state
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