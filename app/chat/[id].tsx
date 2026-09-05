import { useState, useCallback, useRef, createRef, type RefObject } from 'react';
import { View, Text, Image, Pressable, FlatList, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { decode } from 'base64-arraybuffer';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { useChat } from '@/context/ChatProvider';
import { useUserLocation } from '@/hooks/useUserLocation';
import { Avatar } from '@/components/Avatar';
import { ScreenBackground } from '@/components/ScreenBackground';
import { ActionSheet } from '@/components/ActionSheet';
import { ImageViewer } from '@/components/ImageViewer';
import { MessageBubble, type MessageItem } from '@/components/chat/MessageBubble';
import { MessageComposer, type SendMode } from '@/components/chat/MessageComposer';
import { MessageActionSheet } from '@/components/chat/MessageActionSheet';
import { MessageSearchOverlay } from '@/components/chat/MessageSearchOverlay';
import { VideoViewerModal } from '@/components/chat/VideoViewerModal';
import { RequestBanner } from '@/components/chat/RequestBanner';
import { generateClientId, openInMaps } from '@/lib/chat';
import { saveRemoteMediaToGallery, saveViewAsImage } from '@/lib/media';

const MEDIA_BUCKET = 'message-media';

type LocalMessage = MessageItem & { client_generated_id?: string | null; _base64?: string; _base64s?: string[] };
type OtherUser = { id: string; username: string | null; full_name: string | null; avatar_url: string | null };
type MemberStatus = 'accepted' | 'request' | 'left';
type ConversationInfo = { is_group: boolean; name: string | null; avatar_url: string | null; description: string | null; member_count: number; my_role: 'member' | 'admin' | null };

const PAGE_SIZE = 30;
const TYPING_TIMEOUT_MS = 3000;
const MAX_VIDEO_SECONDS = 90;

export default function ChatThread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  const { refreshUnreadCount } = useChat();
  const { refresh: refreshLocation } = useUserLocation();

  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null);
  const [conversationInfo, setConversationInfo] = useState<ConversationInfo | null>(null);
  const conversationInfoRef = useRef<ConversationInfo | null>(null);
  const [myStatus, setMyStatus] = useState<MemberStatus>('accepted');
  const [myBlocked, setMyBlocked] = useState(false);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyingTo, setReplyingTo] = useState<LocalMessage | null>(null);
  const [actionSheetFor, setActionSheetFor] = useState<LocalMessage | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [viewerMessage, setViewerMessage] = useState<LocalMessage | null>(null);
  const [viewerAttachmentIndex, setViewerAttachmentIndex] = useState<number | undefined>(undefined);
  const [pickedAssets, setPickedAssets] = useState<{ uri: string; base64: string }[]>([]);
  const [pickingImages, setPickingImages] = useState(false);
  const [sendMode, setSendMode] = useState<SendMode>('individual');
  const [sharingLocation, setSharingLocation] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [pickingVideo, setPickingVideo] = useState(false);
  const [videoViewerUri, setVideoViewerUri] = useState<string | null>(null);

  const hasMoreRef = useRef(true);
  const polaroidRefsMap = useRef<Map<string, RefObject<View | null>>>(new Map());
  const galleryRefsMap = useRef<Map<string, RefObject<View | null>>>(new Map());
  const attachmentRefsMap = useRef<Map<string, RefObject<View | null>>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const myUserId = session?.user.id;

  const loadMembers = useCallback(async () => {
    if (!id || !myUserId) return;
    const { data: infoData } = await supabase.rpc('get_conversation_info', { p_conversation_id: id }).maybeSingle();
    const info = infoData as ConversationInfo | null;
    if (info) { setConversationInfo(info); conversationInfoRef.current = info; }

    const { data } = await supabase
      .from('conversation_members')
      .select('user_id, status, last_read_at, profiles:user_id(id, username, full_name, avatar_url)')
      .eq('conversation_id', id);
    if (!data) return;
    const rows = data as unknown as { user_id: string; status: MemberStatus; last_read_at: string; profiles: OtherUser | null }[];
    const mine = rows.find((m) => m.user_id === myUserId);
    if (mine) setMyStatus(mine.status);

    if (!info?.is_group) {
      const other = rows.find((m) => m.user_id !== myUserId);
      if (other?.profiles) {
        setOtherUser(other.profiles);
        setOtherLastReadAt(other.last_read_at);
        const { data: blockRow } = await supabase.from('blocked_users').select('id').eq('blocker_id', myUserId).eq('blocked_id', other.profiles.id).maybeSingle();
        setMyBlocked(!!blockRow);
      }
    }
  }, [id, myUserId]);

  async function resolveMediaUrls(rows: LocalMessage[]): Promise<LocalMessage[]> {
    type Target = { path: string; rowId: string; attIndex?: number };
    const targets: Target[] = [];
    rows.forEach((r) => {
      if ((r.message_type === 'image' || r.message_type === 'video' || r.message_type === 'voice') && r.media_path && !r.media_url && !r.local_uri) {
        targets.push({ path: r.media_path, rowId: r.id });
      }
      if (r.message_type === 'gallery') {
        (r.attachments ?? []).forEach((a, i) => {
          if (a.media_path && !a.media_url && !a.local_uri) targets.push({ path: a.media_path, rowId: r.id, attIndex: i });
        });
      }
    });
    if (targets.length === 0) return rows;

    const results = await Promise.all(targets.map((t) => supabase.storage.from(MEDIA_BUCKET).createSignedUrl(t.path, 3600)));

    return rows.map((r) => {
      const single = targets.findIndex((t) => t.rowId === r.id && t.attIndex === undefined);
      const attUpdates = targets
        .map((t, i) => ({ t, url: results[i].data?.signedUrl }))
        .filter(({ t }) => t.rowId === r.id && t.attIndex !== undefined);

      if (single === -1 && attUpdates.length === 0) return r;

      let next = r;
      if (single !== -1 && results[single].data?.signedUrl) {
        next = { ...next, media_url: results[single].data.signedUrl };
      }
      if (attUpdates.length > 0 && next.attachments) {
        const atts = [...next.attachments];
        attUpdates.forEach(({ t, url }) => {
          if (url) atts[t.attIndex as number] = { ...atts[t.attIndex as number], media_url: url };
        });
        next = { ...next, attachments: atts };
      }
      return next;
    });
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
            let raw = payload.new as LocalMessage;
            if (conversationInfoRef.current?.is_group && raw.sender_id !== myUserId) {
              const { data: sender } = await supabase.from('profiles').select('username, full_name').eq('id', raw.sender_id).maybeSingle();
              if (sender) raw = { ...raw, sender_username: sender.username, sender_full_name: sender.full_name };
            }
            if (raw.message_type === 'gallery') {
              // The messages row broadcasts as soon as it's inserted, which can
              // land slightly before the sender's follow-up attachments insert
              // commits — one short retry closes that race in practice.
              const fetchAttachments = () =>
                supabase.from('message_attachments').select('id, media_path').eq('message_id', raw.id).order('position');
              let atts = (await fetchAttachments()).data;
              if (!atts || atts.length === 0) {
                await new Promise((resolve) => setTimeout(resolve, 600));
                atts = (await fetchAttachments()).data;
              }
              raw = { ...raw, attachments: atts ?? [] };
            }
            if (raw.message_type === 'spot' && raw.shared_spot_id) {
              const { data: spot } = await supabase
                .from('spots')
                .select('id, title, photo_url, genre, location_label')
                .eq('id', raw.shared_spot_id)
                .single();
              if (spot) {
                raw = {
                  ...raw,
                  shared_spot_title: spot.title,
                  shared_spot_photo_url: spot.photo_url,
                  shared_spot_genre: spot.genre,
                  shared_spot_location_label: spot.location_label,
                };
              }
            }
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
              const t = typingTimeoutsRef.current.get(row.sender_id);
              if (t) { clearTimeout(t); typingTimeoutsRef.current.delete(row.sender_id); }
              setTypingUsers((prev) => {
                if (!prev.has(row.sender_id)) return prev;
                const next = new Map(prev);
                next.delete(row.sender_id);
                return next;
              });
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
          const typerId: string | undefined = payload?.user_id;
          const typerName: string = payload?.name || 'traveler';
          if (!typerId || typerId === myUserId) return;

          setTypingUsers((prev) => {
            if (prev.get(typerId) === typerName) return prev;
            const next = new Map(prev);
            next.set(typerId, typerName);
            return next;
          });

          const existing = typingTimeoutsRef.current.get(typerId);
          if (existing) clearTimeout(existing);
          typingTimeoutsRef.current.set(typerId, setTimeout(() => {
            typingTimeoutsRef.current.delete(typerId);
            setTypingUsers((prev) => {
              if (!prev.has(typerId)) return prev;
              const next = new Map(prev);
              next.delete(typerId);
              return next;
            });
          }, TYPING_TIMEOUT_MS));
        })
        .subscribe();

      channelRef.current = channel;

      return () => {
        typingTimeoutsRef.current.forEach((t) => clearTimeout(t));
        typingTimeoutsRef.current.clear();
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
      const myName = profile?.username || profile?.full_name || 'traveler';
      channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: myUserId, name: myName } });
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

  async function pickImages() {
    if (!session || !id) return;
    // Covers the whole flow — tapping the icon gives immediate feedback,
    // and it bridges the gap right after the native picker closes while
    // base64 encoding for the last photo(s) may still be finishing.
    setPickingImages(true);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to send a photo.');
        return;
      }
      // Higher quality than spot/profile photos (0.6) — chat photos are shared
      // 1:1 and are the thing being downloaded, so it's worth the extra bytes.
      const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.9, base64: true, mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 10 });
      if (result.canceled) return;
      const assets = result.assets.filter((a) => a.base64).map((a) => ({ uri: a.uri, base64: a.base64 as string }));
      setPickedAssets((prev) => [...prev, ...assets]);
    } finally {
      setPickingImages(false);
    }
  }

  function removePickedAsset(index: number) {
    setPickedAssets((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSend() {
    if (pickedAssets.length > 0) {
      const assets = pickedAssets;
      const caption = text.trim();
      const mode = sendMode;
      setPickedAssets([]);
      setText('');
      setSendMode('individual');
      if (assets.length >= 2 && (mode === 'collage' || mode === 'grid')) {
        await sendGalleryMessage(assets, caption, undefined, mode);
      } else {
        for (let i = 0; i < assets.length; i++) {
          // Sequential, not parallel — keeps send order matching selection order
          // in the message list, and each upload is a decent chunk of work.
          await sendImageMessage(assets[i], undefined, i === assets.length - 1 ? caption : undefined);
        }
      }
    } else {
      sendMessage();
    }
  }

  async function sendImageMessage(asset: { uri: string; base64: string }, retryOf?: LocalMessage, caption?: string) {
    if (!session || !id) return;
    const clientId = retryOf?.client_generated_id ?? generateClientId();
    const tempId = retryOf?.id ?? `temp-${clientId}`;
    const captionText = retryOf ? retryOf.content : (caption || '');

    if (retryOf) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: true, failed: false } : m)));
    } else {
      const temp: LocalMessage = {
        id: tempId,
        sender_id: session.user.id,
        content: captionText,
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
      .insert({ conversation_id: id, sender_id: session.user.id, message_type: 'image', media_path: path, content: captionText || null, client_generated_id: clientId })
      .select()
      .single();

    if (error || !data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
    } else {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, ...data, pending: false } : m)));
      if (myStatus === 'request') setMyStatus('accepted');
    }
  }

  async function pickVideo() {
    if (!session || !id) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to send a video.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const durationSeconds = asset.duration ? Math.round(asset.duration / 1000) : null;
    if (durationSeconds && durationSeconds > MAX_VIDEO_SECONDS) {
      Alert.alert('Video too long', `Please choose a video under ${MAX_VIDEO_SECONDS} seconds.`);
      return;
    }
    sendVideoMessage({ uri: asset.uri, durationSeconds });
  }

  async function sendVideoMessage(asset: { uri: string; durationSeconds: number | null }, retryOf?: LocalMessage) {
    if (!session || !id) return;
    const clientId = retryOf?.client_generated_id ?? generateClientId();
    const tempId = retryOf?.id ?? `temp-${clientId}`;
    const duration = retryOf ? (retryOf.video_duration_seconds ?? null) : asset.durationSeconds;

    if (retryOf) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: true, failed: false } : m)));
    } else {
      const temp: LocalMessage = {
        id: tempId,
        sender_id: session.user.id,
        content: null,
        created_at: new Date().toISOString(),
        client_generated_id: clientId,
        pending: true,
        message_type: 'video',
        local_uri: asset.uri,
        video_duration_seconds: duration,
      };
      setMessages((prev) => [temp, ...prev]);
    }

    setPickingVideo(true);
    try {
      const path = `${id}/${session.user.id}_${Date.now()}.mp4`;
      // Videos can be tens of MB — fetch+arrayBuffer avoids holding a base64
      // copy (roughly 33% larger) in memory the way the photo upload path does.
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, arrayBuffer, { contentType: 'video/mp4' });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('messages')
        .insert({ conversation_id: id, sender_id: session.user.id, message_type: 'video', media_path: path, video_duration_seconds: duration, client_generated_id: clientId })
        .select()
        .single();
      if (error || !data) throw error ?? new Error('insert failed');

      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, ...data, pending: false } : m)));
      if (myStatus === 'request') setMyStatus('accepted');
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
    } finally {
      setPickingVideo(false);
    }
  }

  async function sendVoiceMessage(asset: { uri: string; durationSeconds: number | null }, retryOf?: LocalMessage) {
    if (!session || !id) return;
    const clientId = retryOf?.client_generated_id ?? generateClientId();
    const tempId = retryOf?.id ?? `temp-${clientId}`;
    const duration = retryOf ? (retryOf.voice_duration_seconds ?? null) : asset.durationSeconds;

    if (retryOf) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: true, failed: false } : m)));
    } else {
      const temp: LocalMessage = {
        id: tempId,
        sender_id: session.user.id,
        content: null,
        created_at: new Date().toISOString(),
        client_generated_id: clientId,
        pending: true,
        message_type: 'voice',
        local_uri: asset.uri,
        voice_duration_seconds: duration,
      };
      setMessages((prev) => [temp, ...prev]);
    }

    try {
      const path = `${id}/${session.user.id}_${Date.now()}.m4a`;
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, arrayBuffer, { contentType: 'audio/m4a' });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('messages')
        .insert({ conversation_id: id, sender_id: session.user.id, message_type: 'voice', media_path: path, voice_duration_seconds: duration, client_generated_id: clientId })
        .select()
        .single();
      if (error || !data) throw error ?? new Error('insert failed');

      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, ...data, pending: false } : m)));
      if (myStatus === 'request') setMyStatus('accepted');
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
    }
  }

  async function sendGalleryMessage(assets: { uri: string; base64: string }[], caption: string, retryOf?: LocalMessage, layout?: 'collage' | 'grid') {
    if (!session || !id) return;
    const clientId = retryOf?.client_generated_id ?? generateClientId();
    const tempId = retryOf?.id ?? `temp-${clientId}`;
    const captionText = retryOf ? retryOf.content : (caption || '');
    const galleryLayout = retryOf ? (retryOf.gallery_layout ?? 'collage') : (layout ?? 'collage');

    if (retryOf) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: true, failed: false } : m)));
    } else {
      const temp: LocalMessage = {
        id: tempId,
        sender_id: session.user.id,
        content: captionText,
        created_at: new Date().toISOString(),
        client_generated_id: clientId,
        pending: true,
        message_type: 'gallery',
        gallery_layout: galleryLayout,
        attachments: assets.map((a) => ({ local_uri: a.uri })),
        _base64s: assets.map((a) => a.base64),
      };
      setMessages((prev) => [temp, ...prev]);
    }

    const uploadAssets = retryOf
      ? (retryOf._base64s ?? []).map((base64, i) => ({ base64, uri: retryOf.attachments?.[i]?.local_uri ?? '' }))
      : assets;

    try {
      const paths = await Promise.all(
        uploadAssets.map(async (a, i) => {
          const path = `${id}/${session.user.id}_${Date.now()}_${i}.jpg`;
          const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, decode(a.base64), { contentType: 'image/jpeg' });
          if (error) throw error;
          return path;
        })
      );

      const { data, error } = await supabase
        .from('messages')
        .insert({ conversation_id: id, sender_id: session.user.id, message_type: 'gallery', gallery_layout: galleryLayout, content: captionText || null, client_generated_id: clientId })
        .select()
        .single();
      if (error || !data) throw error ?? new Error('insert failed');

      const { error: attError } = await supabase
        .from('message_attachments')
        .insert(paths.map((media_path, position) => ({ message_id: data.id, media_path, position })));
      if (attError) throw attError;

      setMessages((prev) => prev.map((m) => {
        if (m.id !== tempId) return m;
        const mergedAttachments = paths.map((media_path, i) => ({ ...(m.attachments?.[i] ?? {}), media_path }));
        return { ...m, ...data, pending: false, attachments: mergedAttachments };
      }));
      if (myStatus === 'request') setMyStatus('accepted');
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
    }
  }

  async function shareLocation(retryOf?: LocalMessage) {
    if (!session || !id) return;
    if (!retryOf && sharingLocation) return;
    const clientId = retryOf?.client_generated_id ?? generateClientId();
    const tempId = retryOf?.id ?? `temp-${clientId}`;
    let lat = retryOf?.location_lat ?? null;
    let lng = retryOf?.location_lng ?? null;
    let label = retryOf?.location_label ?? null;

    if (retryOf) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: true, failed: false } : m)));
    } else {
      setSharingLocation(true);
      const coords = await refreshLocation();
      if (!coords) {
        setSharingLocation(false);
        Alert.alert('Location unavailable', 'Allow location access to share your location.');
        return;
      }
      lat = coords.lat;
      lng = coords.lng;
      label = `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
      try {
        const [place] = await Location.reverseGeocodeAsync({ latitude: coords.lat, longitude: coords.lng });
        const text = [place?.city || place?.subregion, place?.region, place?.country].filter(Boolean).join(', ');
        if (text) label = text;
      } catch {
        // Keep the coordinate fallback label — geocoding is a nice-to-have here.
      }
      const temp: LocalMessage = {
        id: tempId,
        sender_id: session.user.id,
        content: null,
        created_at: new Date().toISOString(),
        client_generated_id: clientId,
        pending: true,
        message_type: 'location',
        location_lat: lat,
        location_lng: lng,
        location_label: label,
      };
      setMessages((prev) => [temp, ...prev]);
      setSharingLocation(false);
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: id, sender_id: session.user.id, message_type: 'location', location_lat: lat, location_lng: lng, location_label: label, client_generated_id: clientId })
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
    } else if (item.message_type === 'gallery') {
      if (item._base64s?.length) sendGalleryMessage([], '', item);
    } else if (item.message_type === 'location') {
      shareLocation(item);
    } else if (item.message_type === 'video') {
      if (item.local_uri) sendVideoMessage({ uri: item.local_uri, durationSeconds: item.video_duration_seconds ?? null }, item);
    } else if (item.message_type === 'voice') {
      if (item.local_uri) sendVoiceMessage({ uri: item.local_uri, durationSeconds: item.voice_duration_seconds ?? null }, item);
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
  function handleLeaveGroup() {
    Alert.alert('Leave this group?', 'You can only rejoin if an admin adds you back.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('leave_group_conversation', { p_conversation_id: id });
        if (error) { Alert.alert('Could not leave', error.message); return; }
        router.back();
      } },
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
    if (!conversationInfo?.is_group && !otherUser) return;
    setMenuVisible(true);
  }

  function getPolaroidRef(id: string): RefObject<View | null> {
    if (!polaroidRefsMap.current.has(id)) polaroidRefsMap.current.set(id, createRef<View>());
    return polaroidRefsMap.current.get(id)!;
  }

  function getGalleryRef(id: string): RefObject<View | null> {
    if (!galleryRefsMap.current.has(id)) galleryRefsMap.current.set(id, createRef<View>());
    return galleryRefsMap.current.get(id)!;
  }

  function getAttachmentRef(messageId: string, index: number): RefObject<View | null> {
    const key = `${messageId}:${index}`;
    if (!attachmentRefsMap.current.has(key)) attachmentRefsMap.current.set(key, createRef<View>());
    return attachmentRefsMap.current.get(key)!;
  }

  async function handleSaveAttachmentAsPolaroid(item: LocalMessage, index: number) {
    const ref = attachmentRefsMap.current.get(`${item.id}:${index}`);
    if (!ref) return;
    try {
      const ok = await saveViewAsImage(ref);
      Alert.alert(ok ? 'Saved' : 'Permission needed', ok ? 'Polaroid saved to your gallery.' : 'Allow photo access to save images.');
    } catch {
      Alert.alert('Could not save', 'Something went wrong saving this photo.');
    }
  }

  async function handleSaveGallery(item: LocalMessage) {
    const ref = galleryRefsMap.current.get(item.id);
    if (!ref) return;
    try {
      const ok = await saveViewAsImage(ref);
      Alert.alert(ok ? 'Saved' : 'Permission needed', ok ? 'Saved to your gallery.' : 'Allow photo access to save images.');
    } catch {
      Alert.alert('Could not save', 'Something went wrong saving this photo.');
    }
  }

  async function handleSavePhoto(item: LocalMessage) {
    const uri = item.local_uri || item.media_url;
    if (!uri) return;
    try {
      const ok = await saveRemoteMediaToGallery(uri);
      Alert.alert(ok ? 'Saved' : 'Permission needed', ok ? 'Photo saved to your gallery.' : 'Allow photo access to save images.');
    } catch {
      Alert.alert('Could not save', 'Something went wrong saving this photo.');
    }
  }

  async function handleSaveAsPolaroid(item: LocalMessage) {
    const ref = polaroidRefsMap.current.get(item.id);
    if (!ref) return;
    try {
      const ok = await saveViewAsImage(ref);
      Alert.alert(ok ? 'Saved' : 'Permission needed', ok ? 'Polaroid saved to your gallery.' : 'Allow photo access to save images.');
    } catch {
      Alert.alert('Could not save', 'Something went wrong saving this photo.');
    }
  }

  const isGroup = !!conversationInfo?.is_group;
  const name = isGroup ? (conversationInfo?.name || 'Group') : (otherUser?.username || otherUser?.full_name || 'traveler');
  const lastMineIndex = messages.findIndex((m) => m.sender_id === myUserId);
  const lastMineSeen = lastMineIndex === 0 && !!otherLastReadAt && !!messages[0] && otherLastReadAt >= messages[0].created_at;

  const typingNames = Array.from(typingUsers.values());
  const typingLabel = isGroup
    ? typingNames.length === 0 ? null
      : typingNames.length === 1 ? `${typingNames[0]} is typing…`
      : typingNames.length === 2 ? `${typingNames[0]} and ${typingNames[1]} are typing…`
      : `${typingNames[0]} and ${typingNames.length - 1} others are typing…`
    : typingNames.length > 0 ? 'typing…' : null;

  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Fixed header — stays put; only the message area + composer below react to the keyboard. */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Pressable
          style={styles.headerInfo}
          onPress={() => {
            if (isGroup) router.push({ pathname: '/group/[id]', params: { id: id as string } });
            else if (otherUser) router.push({ pathname: '/user/[id]', params: { id: otherUser.id } });
          }}>
          {isGroup ? (
            <View style={styles.groupHeaderAvatar}>
              {conversationInfo?.avatar_url ? (
                <Image source={{ uri: conversationInfo.avatar_url }} style={styles.groupHeaderAvatarImage} />
              ) : (
                <Ionicons name="people" size={17} color={theme.color.dusk} />
              )}
            </View>
          ) : (
            <Avatar uri={otherUser?.avatar_url} label={name} size={34} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.headerName} numberOfLines={1}>{name}</Text>
            {typingLabel ? (
              <Text style={styles.typingText} numberOfLines={1}>{typingLabel}</Text>
            ) : isGroup ? (
              <Text style={styles.memberCountText}>{conversationInfo?.member_count ?? 0} members</Text>
            ) : null}
          </View>
        </Pressable>
        <Pressable onPress={() => setSearchVisible(true)} style={styles.menuBtn}>
          <Ionicons name="search-outline" size={19} color={theme.color.cream} />
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
                  senderLabel={isGroup && item.sender_id !== myUserId ? (item.sender_username || item.sender_full_name || 'traveler') : undefined}
                  onRetry={() => handleRetry(item)}
                  onLongPress={() => { if (!item.pending) setActionSheetFor(item); }}
                  onToggleReaction={(emoji) => toggleReaction(item, emoji)}
                  onPressImage={(uri, attIndex) => { setViewerUri(uri); setViewerMessage(item); setViewerAttachmentIndex(attIndex); }}
                  onSaveGallery={item.message_type === 'gallery' ? () => handleSaveGallery(item) : undefined}
                  onPressSpot={(spotId) => router.push({ pathname: '/spot/[id]', params: { id: spotId } })}
                  onPressLocation={openInMaps}
                  onPressVideo={setVideoViewerUri}
                  polaroidRef={item.message_type === 'image' ? getPolaroidRef(item.id) : undefined}
                  galleryRef={item.message_type === 'gallery' ? getGalleryRef(item.id) : undefined}
                  getAttachmentRef={item.message_type === 'gallery' ? (index) => getAttachmentRef(item.id, index) : undefined}
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
            onSend={handleSend}
            onPickImage={pickImages}
            pickingImages={pickingImages}
            onPickVideo={pickVideo}
            pickingVideo={pickingVideo}
            onShareLocation={() => shareLocation()}
            sharingLocation={sharingLocation}
            pickedAssets={pickedAssets}
            onRemoveAsset={removePickedAsset}
            sendMode={sendMode}
            onChangeSendMode={setSendMode}
            onSendVoice={(uri, durationSeconds) => sendVoiceMessage({ uri, durationSeconds })}
            paddingBottom={Math.max(insets.bottom, 16) + 16}
          />
        )}
      </KeyboardAvoidingView>

      <MessageActionSheet
        visible={!!actionSheetFor}
        onClose={() => setActionSheetFor(null)}
        onReply={() => actionSheetFor && setReplyingTo(actionSheetFor)}
        onReact={(emoji) => actionSheetFor && toggleReaction(actionSheetFor, emoji)}
        showSaveOptions={actionSheetFor?.message_type === 'image'}
        onSavePhoto={() => actionSheetFor && handleSavePhoto(actionSheetFor)}
        onSaveAsPolaroid={() => actionSheetFor && handleSaveAsPolaroid(actionSheetFor)}
      />

      <ActionSheet
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        title={name}
        options={isGroup ? [
          { key: 'clear', label: 'Clear chat', icon: 'brush-outline', onPress: handleClear },
          { key: 'info', label: 'Group info', icon: 'information-circle-outline', onPress: () => router.push({ pathname: '/group/[id]', params: { id: id as string } }) },
          { key: 'leave', label: 'Leave group', icon: 'exit-outline', destructive: true, onPress: handleLeaveGroup },
        ] : [
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

      <ImageViewer
        visible={!!viewerUri}
        uri={viewerUri}
        onClose={() => { setViewerUri(null); setViewerMessage(null); setViewerAttachmentIndex(undefined); }}
        onSaveStyled={
          viewerMessage?.message_type === 'image' ? () => handleSaveAsPolaroid(viewerMessage)
          : viewerMessage?.message_type === 'gallery' && viewerAttachmentIndex !== undefined ? () => handleSaveAttachmentAsPolaroid(viewerMessage, viewerAttachmentIndex)
          : undefined
        }
        styledLabel="Save as polaroid"
      />

      {id && myUserId && (
        <MessageSearchOverlay visible={searchVisible} conversationId={id} myUserId={myUserId} onClose={() => setSearchVisible(false)} />
      )}

      <VideoViewerModal visible={!!videoViewerUri} uri={videoViewerUri} onClose={() => setVideoViewerUri(null)} />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.color.surface2, backgroundColor: theme.color.dusk },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerName: { fontFamily: theme.font.body, fontSize: 15, color: theme.color.cream },
  typingText: { fontFamily: theme.font.bodyRegular, fontSize: 11, color: theme.color.gold, marginTop: 1 },
  memberCountText: { fontFamily: theme.font.bodyRegular, fontSize: 11, color: theme.color.muted, marginTop: 1 },
  groupHeaderAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  groupHeaderAvatarImage: { width: '100%', height: '100%' },
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
