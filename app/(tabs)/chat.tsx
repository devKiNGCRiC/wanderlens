import { useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { useChat } from '@/context/ChatProvider';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ActionSheet } from '@/components/ActionSheet';
import { ConversationRow, type ConversationSummary } from '@/components/chat/ConversationRow';
import { ConversationOptionsSheet, type ConversationAction } from '@/components/chat/ConversationOptionsSheet';

const SEGMENTS = ['Inbox', 'Requests'] as const;
type Segment = typeof SEGMENTS[number];

export default function ChatListScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { refreshUnreadCount } = useChat();
  const [segment, setSegment] = useState<Segment>('Inbox');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [requests, setRequests] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [optionsFor, setOptionsFor] = useState<ConversationSummary | null>(null);
  const [composeMenuVisible, setComposeMenuVisible] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    const [inboxRes, requestsRes] = await Promise.all([
      supabase.rpc('list_conversations', { p_status: 'accepted' }),
      supabase.rpc('list_conversations', { p_status: 'request' }),
    ]);
    if (!inboxRes.error) setConversations((inboxRes.data as ConversationSummary[]) ?? []);
    if (!requestsRes.error) setRequests((requestsRes.data as ConversationSummary[]) ?? []);
    setLoading(false);
    refreshUnreadCount();
  }, [session]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function acceptRequest(item: ConversationSummary) {
    setRequests((prev) => prev.filter((r) => r.conversation_id !== item.conversation_id));
    await supabase.from('conversation_members').update({ status: 'accepted' }).eq('conversation_id', item.conversation_id).eq('user_id', session!.user.id);
    load();
  }
  async function declineRequest(item: ConversationSummary) {
    setRequests((prev) => prev.filter((r) => r.conversation_id !== item.conversation_id));
    await supabase.rpc('decline_conversation_request', { p_conversation_id: item.conversation_id });
  }

  async function handleAction(action: ConversationAction) {
    if (!optionsFor) return;
    const id = optionsFor.conversation_id;
    switch (action) {
      case 'pin': case 'unpin':
        await supabase.rpc('set_conversation_flag', { p_conversation_id: id, p_flag: 'pinned', p_value: action === 'pin' });
        break;
      case 'mute': case 'unmute':
        await supabase.rpc('set_conversation_flag', { p_conversation_id: id, p_flag: 'muted', p_value: action === 'mute' });
        break;
      case 'favorite': case 'unfavorite':
        await supabase.rpc('set_conversation_flag', { p_conversation_id: id, p_flag: 'favorite', p_value: action === 'favorite' });
        break;
      case 'archive': case 'unarchive':
        await supabase.rpc('set_conversation_flag', { p_conversation_id: id, p_flag: 'archived', p_value: action === 'archive' });
        break;
      case 'markUnread':
        await supabase.rpc('mark_conversation_unread', { p_conversation_id: id });
        break;
      case 'clear':
        await supabase.rpc('clear_conversation', { p_conversation_id: id });
        break;
      case 'delete':
        Alert.alert('Delete this chat?', 'It will be removed from your inbox. The other person keeps their copy.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.rpc('delete_conversation', { p_conversation_id: id }); load(); } },
        ]);
        return;
    }
    load();
  }

  const data = segment === 'Inbox' ? conversations : requests;

  return (
    <ScreenBackground>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Chat</Text>
          <View style={styles.headerBtns}>
            <Pressable onPress={() => router.push('/chat/archived')} style={styles.iconBtn}>
              <Ionicons name="archive-outline" size={18} color={theme.color.gold} />
            </Pressable>
            <Pressable onPress={() => setComposeMenuVisible(true)} style={styles.iconBtn}>
              <Ionicons name="create-outline" size={20} color={theme.color.gold} />
            </Pressable>
          </View>
        </View>
        <View style={styles.segments}>
          {SEGMENTS.map((s) => (
            <Pressable key={s} onPress={() => setSegment(s)} style={[styles.segment, segment === s && styles.segmentActive]}>
              <Text style={[styles.segmentText, segment === s && styles.segmentTextActive]}>{s}</Text>
              {s === 'Requests' && requests.length > 0 && (
                <View style={styles.badge}><Text style={styles.badgeText}>{requests.length}</Text></View>
              )}
            </Pressable>
          ))}
        </View>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.color.gold} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.conversation_id}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 110 }}
          renderItem={({ item }) =>
            segment === 'Inbox' ? (
              <ConversationRow
                item={item}
                myUserId={session!.user.id}
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.conversation_id } })}
                onLongPress={() => setOptionsFor(item)}
              />
            ) : (
              <View>
                <ConversationRow
                  item={item}
                  myUserId={session!.user.id}
                  onPress={() => router.push({ pathname: '/chat/[id]', params: { id: item.conversation_id } })}
                />
                <View style={styles.requestActions}>
                  <Pressable onPress={() => acceptRequest(item)} style={styles.acceptBtn}><Text style={styles.acceptBtnText}>Accept</Text></Pressable>
                  <Pressable onPress={() => declineRequest(item)} style={styles.declineBtn}><Text style={styles.declineBtnText}>Decline</Text></Pressable>
                </View>
              </View>
            )
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {segment === 'Inbox'
                ? 'No conversations yet — message someone from their profile.'
                : 'No message requests.'}
            </Text>
          }
        />
      )}

      {optionsFor && (
        <ConversationOptionsSheet
          visible={!!optionsFor}
          onClose={() => setOptionsFor(null)}
          onSelect={handleAction}
          isPinned={optionsFor.is_pinned}
          isMuted={optionsFor.is_muted}
          isFavorite={optionsFor.is_favorite}
          isArchived={optionsFor.is_archived}
        />
      )}

      <ActionSheet
        visible={composeMenuVisible}
        onClose={() => setComposeMenuVisible(false)}
        options={[
          { key: 'message', label: 'New message', icon: 'person-outline', onPress: () => router.push('/new-message') },
          { key: 'group', label: 'New group', icon: 'people-outline', onPress: () => router.push('/create-group') },
        ]}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 24, paddingTop: 60, paddingBottom: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  title: { fontFamily: theme.font.display, fontSize: 26, color: theme.color.cream },
  headerBtns: { flexDirection: 'row', gap: 10 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: theme.color.surface2, alignItems: 'center', justifyContent: 'center' },
  segments: { flexDirection: 'row', backgroundColor: theme.color.surface, borderRadius: 24, padding: 4, borderWidth: 1, borderColor: theme.color.surface2 },
  segment: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 20 },
  segmentActive: { backgroundColor: theme.color.gold },
  segmentText: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted },
  segmentTextActive: { fontFamily: theme.font.body, color: theme.color.dusk },
  badge: { backgroundColor: theme.color.ember, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { fontFamily: theme.font.body, fontSize: 9, color: theme.color.cream },
  separator: { height: 1, backgroundColor: theme.color.surface2, marginLeft: 62 },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center', padding: 40 },
  requestActions: { flexDirection: 'row', gap: 10, marginLeft: 62, marginBottom: 10, marginTop: -4 },
  acceptBtn: { flex: 1, backgroundColor: theme.color.gold, borderRadius: 16, paddingVertical: 8, alignItems: 'center' },
  acceptBtnText: { fontFamily: theme.font.body, fontSize: 12, color: theme.color.dusk },
  declineBtn: { flex: 1, borderWidth: 1, borderColor: theme.color.surface2, borderRadius: 16, paddingVertical: 8, alignItems: 'center' },
  declineBtnText: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.muted },
});
