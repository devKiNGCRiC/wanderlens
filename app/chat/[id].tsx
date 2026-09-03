import { useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { useChat } from '@/context/ChatProvider';
import { Avatar } from '@/components/Avatar';
import { ActionSheet } from '@/components/ActionSheet';
import { ImageViewer } from '@/components/ImageViewer';
import { MessageBubble, type MessageItem } from '@/components/chat/MessageBubble';
import { MessageComposer } from '@/components/chat/MessageComposer';
import { MessageActionSheet } from '@/components/chat/MessageActionSheet';
import { RequestBanner } from '@/components/chat/RequestBanner';
import { generateClientId } from '@/lib/chat';

const MEDIA_BUCKET = 'message-media';

type LocalMessage = MessageItem & { client_generated_id?: string | null; _base64?: string };
type OtherUser = { id: string; username: string | null; full_name: string | null; avatar_url: string | null };
type MemberStatus = 'accepted' | 'request' | 'left';

const PAGE_SIZE = 30;
const TYPING_TIMEOUT_MS = 3000;

export default function ChatThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { refreshUnreadCount } = useChat();

  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null);
  const [myStatus, setMyStatus] = useState<MemberStatus>('accepted');
  const [myBlocked, setMyBlocked] = useState(false);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyingTo, setReplyingTo] = useState<LocalMessage | null>(null);
  const [actionSheetFor, setActionSheetFor] = useState<LocalMessage | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const hasMoreRef = useRef(true);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSentRef = useRef(0);
  const otherTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myUserId = session?.user.id;

  const loadMembers = useCallback(async () => {
    if (!id || !myUserId) return;
    const { data } = await supabase
      .from('conversation_members')
      .select('user_id, status, last_read_at, profiles:user_id(id, username, full_name, avatar_url)')
      .eq('conversation_id', id);
    if (!data) return;
    const rows = data as unknown as { user_id: string; status: MemberStatus; last_read_at: string; profiles: OtherUser | null }[];
    const mine = rows.find((m) => m.user_id === myUserId);
    const other = rows.find((m) => m.user_id !== myUserId);
    if (mine) setMyStatus(mine.status);
    if (other?.profiles) {
      setOtherUser(other.profiles);
      setOtherLastReadAt(other.last_read_at);
      const { data: blockRow } = await supabase.from('blocked_users').select('id').eq('blocker_id', myUserId).eq('blocked_id', other.profiles.id).maybeSingle();
      setMyBlocked(!!blockRow);
    }
  }, [id, myUserId]);

  async function resolveMediaUrls(rows: LocalMessage[]): Promise<LocalMessage[]> {
    const needsResolve = rows.filter((r) => r.message_type === 'image' && r.media_path && !r.media_url && !r.local_uri);
    if (needsResolve.length === 0) return rows;
    const results = await Promise.all(
      needsResolve.map((r) => supabase.storage.from(MEDIA_BUCKET).createSignedUrl(r.media_path as string, 3600))
    );
    const urlMap = new Map(needsResolve.map((r, i) => [r.id, results[i].data?.signedUrl]));
    return rows.map((r) => (urlMap.has(r.id) ? { ...r, media_url: urlMap.get(r.id) } : r));
  }

  const loadMessages = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase.rpc('get_conversation_messages', { p_conversation_id: id, p_limit: PAGE_SIZE });
    if (!error && data) {
      const rows = data as LocalMessage[];
      setMessages(await resolveMediaUrls(rows));
      hasMoreRef.current = rows.length === PAGE_SIZE;
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (!id || !myUserId) return;
      loadMembers();
      loadMessages();
      supabase.rpc('mark_conversation_read', { p_conversation_id: id }).then(() => refreshUnreadCount());

      const channel: RealtimeChannel = supabase
        .channel(`conversation:${id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
          async (payload) => {
            const raw = payload.new as LocalMessage;
            const [row] = await resolveMediaUrls([raw]);
            setMessages((prev) => {
              if (prev.some((m) => m.id === row.id)) return prev;
              if (row.client_generated_id) {
                const idx = prev.findIndex((m) => m.pending && m.client_generated_id === row.client_generated_id);
                if (idx !== -1) {
                  const next = [...prev];
                  next[idx] = { ...prev[idx], ...row, pending: false };
                  return next;
                }
              }
              return [{ ...row, pending: false }, ...prev];
            });
            if (row.sender_id !== myUserId) {
              setOtherTyping(false);
              supabase.rpc('mark_conversation_read', { p_conversation_id: id }).then(() => refreshUnreadCount());
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${id}` },
          (payload) => {
            const row = payload.new as { user_id: string; last_read_at: string };
            if (row.user_id !== myUserId) setOtherLastReadAt(row.last_read_at);
          }
        )
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (payload?.user_id === myUserId) return;
          setOtherTyping(true);
          if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
          otherTypingTimeoutRef.current = setTimeout(() => setOtherTyping(false), TYPING_TIMEOUT_MS);
        })
        .subscribe();

      channelRef.current = channel;

      return () => {
        if (otherTypingTimeoutRef.current) clearTimeout(otherTypingTimeoutRef.current);
        supabase.removeChannel(channel);
        channelRef.current = null;
        refreshUnreadCount();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, myUserId])
  );

  async function loadOlder() {
    if (!hasMoreRef.current || loadingMore || messages.length === 0) return;
    const oldest = messages[messages.length - 1];
    setLoadingMore(true);
    const { data, error } = await supabase.rpc('get_conversation_messages', {
      p_conversation_id: id,
      p_before: oldest.created_at,
      p_limit: PAGE_SIZE,
    });
    if (!error && data) {
      const page = data as LocalMessage[];
      hasMoreRef.current = page.length === PAGE_SIZE;
      const resolved = await resolveMediaUrls(page);
      setMessages((prev) => [...prev, ...resolved]);
    }
    setLoadingMore(false);
  }

  function handleChangeText(t: string) {
    setText(t);
    const now = Date.now();
    if (channelRef.current && now - lastTypingSentRef.current > 1500) {
      lastTypingSentRef.current = now;
      channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: myUserId } });
    }
  }

  async function sendMessage(retryOf?: LocalMessage) {
    if (!session || !id) return;
    const content = (retryOf?.content ?? text).trim();
    if (!content) return;
    const clientId = retryOf?.client_generated_id ?? generateClientId();
    const tempId = retryOf?.id ?? `temp-${clientId}`;
    const replyTo = retryOf ? null : replyingTo;

    if (retryOf) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: true, failed: false } : m)));
    } else {
      const temp: LocalMessage = {
        id: tempId,
        sender_id: session.user.id,
        content,
        created_at: new Date().toISOString(),
        client_generated_id: clientId,
        pending: true,
        reply_to_id: replyTo?.id,
        reply_to_content: replyTo?.content,
        reply_to_sender_name: replyTo ? (replyTo.sender_id === myUserId ? 'You' : (otherUser?.username || otherUser?.full_name || 'traveler')) : undefined,
      };
      setMessages((prev) => [temp, ...prev]);
      setText('');
      setReplyingTo(null);
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: id,
        sender_id: session.user.id,
        content,
        client_generated_id: clientId,
        reply_to_id: replyTo?.id ?? null,
      })
      .select()
      .single();

    if (error || !data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
    } else {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, ...data, pending: false } : m)));
      if (myStatus === 'request') setMyStatus('accepted');
    }
  }

  async function pickAndSendImage() {
    if (!session || !id) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to send a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true, mediaTypes: ['images'] });
    if (result.canceled || !result.assets[0]?.base64) return;
    sendImageMessage({ uri: result.assets[0].uri, base64: result.assets[0].base64 });
  }

  async function sendImageMessage(asset: { uri: string; base64: string }, retryOf?: LocalMessage) {
    if (!session || !id) return;
    const clientId = retryOf?.client_generated_id ?? generateClientId();
    const tempId = retryOf?.id ?? `temp-${clientId}`;

    if (retryOf) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: true, failed: false } : m)));
    } else {
      const temp: LocalMessage = {
        id: tempId,
        sender_id: session.user.id,
        content: '',
        created_at: new Date().toISOString(),
        client_generated_id: clientId,
        pending: true,
        message_type: 'image',
        local_uri: asset.uri,
        _base64: asset.base64,
      };
      setMessages((prev) => [temp, ...prev]);
    }

    const path = `${id}/${session.user.id}_${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, decode(asset.base64), { contentType: 'image/jpeg' });
    if (uploadError) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
      return;
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: id, sender_id: session.user.id, message_type: 'image', media_path: path, client_generated_id: clientId })
      .select()
      .single();

    if (error || !data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
    } else {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, ...data, pending: false } : m)));
      if (myStatus === 'request') setMyStatus('accepted');
    }
  }

  function handleRetry(item: LocalMessage) {
    if (item.message_type === 'image') {
      if (item._base64 && item.local_uri) sendImageMessage({ uri: item.local_uri, base64: item._base64 }, item);
    } else {
      sendMessage(item);
    }
  }

  async function acceptRequest() {
    if (!session || !id) return;
    await supabase.from('conversation_members').update({ status: 'accepted' }).eq('conversation_id', id).eq('user_id', session.user.id);
    setMyStatus('accepted');
  }

  async function toggleReaction(message: LocalMessage, emoji: string) {
    if (!myUserId) return;
    const already = message.reactions?.some((r) => r.emoji === emoji && r.user_id === myUserId);
    setMessages((prev) => prev.map((m) => {
      if (m.id !== message.id) return m;
      const reactions = m.reactions ?? [];
      return {
        ...m,
        reactions: already ? reactions.filter((r) => !(r.emoji === emoji && r.user_id === myUserId)) : [...reactions, { emoji, user_id: myUserId }],
      };
    }));
    if (already) await supabase.from('message_reactions').delete().eq('message_id', message.id).eq('user_id', myUserId).eq('emoji', emoji);
    else await supabase.from('message_reactions').insert({ message_id: message.id, user_id: myUserId, emoji });
  }

  async function handleClear() {
    if (!id) return;
    await supabase.rpc('clear_conversation', { p_conversation_id: id });
    loadMessages();
  }
  function handleDelete() {
    Alert.alert('Delete this chat?', 'It will be removed from your inbox. The other person keeps their copy.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.rpc('delete_conversation', { p_conversation_id: id }); router.back(); } },
    ]);
  }
  function toggleBlock() {
    if (!myUserId || !otherUser) return;
    if (myBlocked) {
      supabase.from('blocked_users').delete().eq('blocker_id', myUserId).eq('blocked_id', otherUser.id).then(() => setMyBlocked(false));
      return;
    }
    Alert.alert(`Block ${otherUser.username || otherUser.full_name || 'this person'}?`, "They won't be able to message you.", [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: async () => { await supabase.from('blocked_users').insert({ blocker_id: myUserId, blocked_id: otherUser.id }); setMyBlocked(true); } },
    ]);
  }
  async function submitReport(reason: string) {
    if (!otherUser) return;
    await supabase.rpc('report_content', { p_target_type: 'user', p_target_id: otherUser.id, p_reason: reason });
    Alert.alert('Reported', "Thanks — we'll review this.");
  }
  function openMenu() {
    if (!otherUser) return;
    setMenuVisible(true);
  }

  const name = otherUser?.username || otherUser?.full_name || 'traveler';
  const lastMineIndex = messages.findIndex((m) => m.sender_id === myUserId);
  const lastMineSeen = lastMineIndex === 0 && !!otherLastReadAt && !!messages[0] && otherLastReadAt >= messages[0].created_at;

  return (
    <View style={{ flex: 1, backgroundColor: theme.color.dusk }}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Fixed header — stays put; only the message area + composer below react to the keyboard. */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Pressable
          style={styles.headerInfo}
          onPress={() => otherUser && router.push({ pathname: '/user/[id]', params: { id: otherUser.id } })}>
          <Avatar uri={otherUser?.avatar_url} label={name} size={34} />
          <View style={{ flex: 1 }}>
            <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
            {otherTyping && <Text style={styles.typingText}>typing…</Text>}
          </View>
        </Pressable>
        <Pressable onPress={openMenu} style={styles.menuBtn}>
          <Ionicons name="ellipsis-vertical" size={18} color={theme.color.cream} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={theme.color.gold} /></View>
        ) : messages.length === 0 ? (
          <View style={styles.center}><Text style={styles.emptyText}>Say hello 👋</Text></View>
        ) : (
          <FlatList
            data={messages}
            inverted
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item, index }) => (
              <View>
                <MessageBubble
                  message={item}
                  isMine={item.sender_id === myUserId}
                  myUserId={myUserId ?? ''}
                  onRetry={() => handleRetry(item)}
                  onLongPress={() => { if (!item.pending) setActionSheetFor(item); }}
                  onToggleReaction={(emoji) => toggleReaction(item, emoji)}
                  onPressImage={setViewerUri}
                />
                {index === 0 && item.sender_id === myUserId && lastMineSeen && (
                  <Text style={styles.seenText}>Seen</Text>
                )}
              </View>
            )}
            onEndReached={loadOlder}
            onEndReachedThreshold={0.4}
            ListFooterComponent={loadingMore ? <ActivityIndicator color={theme.color.gold} style={{ marginVertical: 12 }} /> : null}
          />
        )}

        {myStatus === 'request' && <RequestBanner name={name} onAccept={acceptRequest} />}

        {replyingTo && (
          <View style={styles.replyBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.replyBarName}>Replying to {replyingTo.sender_id === myUserId ? 'yourself' : name}</Text>
              <Text style={styles.replyBarText} numberOfLines={1}>{replyingTo.content}</Text>
            </View>
            <Pressable onPress={() => setReplyingTo(null)}><Ionicons name="close" size={16} color={theme.color.muted} /></Pressable>
          </View>
        )}

        {myBlocked ? (
          <View style={[styles.blockedBar, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
            <Text style={styles.blockedText}>You blocked {name}.</Text>
            <Pressable onPress={toggleBlock} style={styles.unblockBtn}><Text style={styles.unblockText}>Unblock</Text></Pressable>
          </View>
        ) : (
          <MessageComposer
            value={text}
            onChangeText={handleChangeText}
            onSend={() => sendMessage()}
            onPickImage={pickAndSendImage}
            paddingBottom={Math.max(insets.bottom, 16) + 16}
          />
        )}
      </KeyboardAvoidingView>

      <MessageActionSheet
        visible={!!actionSheetFor}
        onClose={() => setActionSheetFor(null)}
        onReply={() => actionSheetFor && setReplyingTo(actionSheetFor)}
        onReact={(emoji) => actionSheetFor && toggleReaction(actionSheetFor, emoji)}
      />

      <ActionSheet
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        title={name}
        options={[
          { key: 'clear', label: 'Clear chat', icon: 'brush-outline', onPress: handleClear },
          { key: 'delete', label: 'Delete chat', icon: 'trash-outline', destructive: true, onPress: handleDelete },
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

      <ImageViewer visible={!!viewerUri} uri={viewerUri} onClose={() => setViewerUri(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.color.surface2, backgroundColor: theme.color.dusk },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerName: { fontFamily: theme.font.body, fontSize: 15, color: theme.color.cream },
  typingText: { fontFamily: theme.font.bodyRegular, fontSize: 11, color: theme.color.gold, marginTop: 1 },
  menuBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 14, paddingTop: 14, flexGrow: 1, justifyContent: 'flex-end' },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center' },
  seenText: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.muted, textAlign: 'right', marginRight: 4, marginTop: -2, marginBottom: 4 },
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.color.surface, borderTopWidth: 1, borderTopColor: theme.color.surface2 },
  replyBarName: { fontFamily: theme.font.body, fontSize: 11.5, color: theme.color.gold },
  replyBarText: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.muted, marginTop: 1 },
  blockedBar: { paddingTop: 14, paddingHorizontal: 20, alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: theme.color.surface2, backgroundColor: theme.color.dusk },
  blockedText: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted },
  unblockBtn: { borderWidth: 1, borderColor: theme.color.gold, borderRadius: theme.radius.sm, paddingVertical: 8, paddingHorizontal: 16 },
  unblockText: { fontFamily: theme.font.body, fontSize: 12.5, color: theme.color.gold },
});
