/**
 * Route: /chat/[id], Conversation thread screen (1:1 and group chats).
 *
 * Purpose: the full chat view for one conversation, where `id` is a
 * `conversations.id`. Opened from the Chat tab inbox (app/(tabs)/chat.tsx),
 * the archived list (app/chat/archived.tsx), a user's profile
 * (app/user/[id].tsx), new-message / create-group (which `router.replace`
 * here), and message notifications (app/notifications.tsx). The route is
 * registered by name in the signed-in-and-onboarded <Stack.Protected> block of app/_layout.tsx,
 * and this screen hides the native header and draws its own.
 *
 * How it works:
 * - Loading: `get_conversation_info` RPC (group name/avatar/member count/my
 *   role) plus a `conversation_members` query (my status, the other person's
 *   profile and read receipt) plus `blocked_users` for the block state.
 *   Messages come from the `get_conversation_messages` RPC, newest first,
 *   PAGE_SIZE at a time, with older pages fetched as the user scrolls up.
 * - Realtime: one Supabase channel per open thread (`conversation:<id>`)
 *   listens for new `messages` rows, `conversation_members` updates (read
 *   receipts), and "typing" broadcast events. Opened on focus, torn down on
 *   blur.
 * - Sending is optimistic: a temporary message (id `temp-<clientId>`,
 *   `pending: true`) is shown immediately, then replaced by the real row
 *   once the insert returns. A `client_generated_id` ties the temp row to the
 *   realtime echo of the same insert so it never shows twice. Failed sends
 *   stay in the list with `failed: true` and a retry button.
 * - Media (photos, galleries, video, voice, documents) is uploaded to the
 *   private `message-media` storage bucket under `<conversationId>/...`
 *   (storage RLS checks membership using that first folder), and displayed
 *   through short-lived signed URLs because the bucket is not public.
 * - Moderation / housekeeping: block/unblock, report, clear chat, delete chat
 *   (1:1), leave group, and accept a message request.
 *
 * Why:
 * - useFocusEffect instead of useEffect: the realtime channel and read
 *   receipt should only be live while this screen is actually visible, and
 *   data should refresh when the user navigates back to it.
 * - Several values live in refs (hasMoreRef, channelRef, conversationInfoRef,
 *   typing timers) because they are read inside long-lived callbacks
 *   (realtime handlers, onEndReached) where a state value would be a stale
 *   snapshot, and changing them should not trigger a re-render.
 *
 * Gotchas:
 * - The FlatList is `inverted`, so index 0 is the newest message at the
 *   bottom of the screen, and "end reached" means the user scrolled up to the
 *   oldest loaded message.
 * - Blocking, request auto-accept, and chat revival for someone who deleted
 *   the chat are enforced in Postgres (RLS policy + the handle_new_message
 *   trigger in the chat_phase1/phase2 migrations). The local state changes
 *   here only mirror them for the UI.
 */
import { useState, useCallback, useRef, createRef, type RefObject } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Alert, Linking } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, useFocusEffect, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
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
import { placeLabel } from '@/lib/geocoding';
import { saveRemoteMediaToGallery, saveViewAsImage, probeAudioDuration } from '@/lib/media';

/**
 * Private Supabase Storage bucket for chat attachments (created in
 * chat_phase3_photos.sql). Private means files are only reachable through
 * signed URLs, and storage RLS only lets conversation members read/upload.
 */
const MEDIA_BUCKET = 'message-media';

/**
 * A message as this screen holds it: the shared MessageItem shape used by
 * MessageBubble, plus client-only fields.
 * - client_generated_id: random id created before the insert, used to match
 *   the optimistic temp row with the server row / realtime echo.
 * - _base64 / _base64s: the picked photo(s) kept in memory so a failed image
 *   or gallery send can be retried without re-picking.
 * - _mimeType: the picked document's MIME type, kept for document retries.
 * - _serverMessageId: set on a failed gallery whose `messages` row was
 *   already created but whose photo rows were not. A retry then only adds
 *   the missing photos instead of inserting a second, duplicate message.
 */
type LocalMessage = MessageItem & { client_generated_id?: string | null; _base64?: string; _base64s?: string[]; _mimeType?: string | null; _serverMessageId?: string };
/** The other participant's profile in a 1:1 chat (from the profiles join on conversation_members). */
type OtherUser = { id: string; username: string | null; full_name: string | null; avatar_url: string | null };
/**
 * My membership status in this conversation (conversation_members.status):
 * 'accepted' = normal chat, 'request' = someone not connected messaged me and
 * I haven't accepted yet, 'left' = I deleted the chat / left the group.
 */
type MemberStatus = 'accepted' | 'request' | 'left';
/** One row from the get_conversation_info RPC: group identity plus my role in it. */
type ConversationInfo = { is_group: boolean; name: string | null; avatar_url: string | null; description: string | null; member_count: number; my_role: 'member' | 'admin' | null };

/** Messages fetched per page from get_conversation_messages. */
const PAGE_SIZE = 30;
/** How long a "typing…" indicator stays up after the last typing event from that person. */
const TYPING_TIMEOUT_MS = 3000;
/** Longest video the picker will accept, in seconds. */
const MAX_VIDEO_SECONDS = 90;

/**
 * The conversation thread screen. Reads the conversation id from the URL,
 * loads members and messages, keeps a realtime subscription open while
 * focused, and renders the header, message list, composer, and the various
 * sheets/modals (message actions, chat menu, report, image/video viewers,
 * search).
 */
export default function ChatThread() {
  // `id` is the [id] segment of the URL, i.e. the conversation id.
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  // Keeps the Chat tab's unread badge (ChatProvider) in sync after reading here.
  const { refreshUnreadCount } = useChat();
  // `refresh` asks for location permission and returns the current coords (or null).
  const { refresh: refreshLocation } = useUserLocation();

  // Who/what this conversation is: the other person (1:1 only), when they
  // last read the thread (for "Seen"), the group info, and my own membership
  // and block state. conversationInfoRef mirrors conversationInfo so the
  // realtime handler (created once per focus) can read the latest value.
  const [otherUser, setOtherUser] = useState<OtherUser | null>(null);
  const [otherLastReadAt, setOtherLastReadAt] = useState<string | null>(null);
  const [conversationInfo, setConversationInfo] = useState<ConversationInfo | null>(null);
  const conversationInfoRef = useRef<ConversationInfo | null>(null);
  const [myStatus, setMyStatus] = useState<MemberStatus>('accepted');
  const [myBlocked, setMyBlocked] = useState(false);
  // The message list (newest first, to match the inverted FlatList), the
  // composer text, and loading flags for the first page and older pages.
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  // Message interactions: the message being replied to, the one whose
  // long-press action sheet is open, and who is currently typing
  // (user id -> display name).
  const [replyingTo, setReplyingTo] = useState<LocalMessage | null>(null);
  const [actionSheetFor, setActionSheetFor] = useState<LocalMessage | null>(null);
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  // Overlays: the "..." chat menu, the report reasons sheet, and the
  // full-screen image viewer (which also remembers which message/attachment
  // it came from, so "Save as polaroid" knows what to capture).
  const [menuVisible, setMenuVisible] = useState(false);
  const [reportSheetVisible, setReportSheetVisible] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [viewerMessage, setViewerMessage] = useState<LocalMessage | null>(null);
  const [viewerAttachmentIndex, setViewerAttachmentIndex] = useState<number | undefined>(undefined);
  // Composer attachments: photos picked but not yet sent, how to send several
  // (individually or as one collage/grid gallery message), and "busy" flags
  // that disable each attach button while its picker/upload is running.
  const [pickedAssets, setPickedAssets] = useState<{ uri: string; base64: string }[]>([]);
  const [pickingImages, setPickingImages] = useState(false);
  const [sendMode, setSendMode] = useState<SendMode>('individual');
  const [sharingLocation, setSharingLocation] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);
  const [pickingVideo, setPickingVideo] = useState(false);
  const [videoViewerUri, setVideoViewerUri] = useState<string | null>(null);
  const [pickingDocument, setPickingDocument] = useState(false);
  const [pickingCamera, setPickingCamera] = useState(false);

  // Whether older pages may exist (a ref so onEndReached reads the live value).
  const hasMoreRef = useRef(true);
  // Refs to the on-screen views of image bubbles, gallery bubbles, and single
  // gallery attachments, keyed by message id (or "messageId:index"). They are
  // handed to MessageBubble and later captured as a JPEG by saveViewAsImage
  // for "Save as polaroid" / "Save gallery".
  const polaroidRefsMap = useRef<Map<string, RefObject<View | null>>>(new Map());
  const galleryRefsMap = useRef<Map<string, RefObject<View | null>>>(new Map());
  const attachmentRefsMap = useRef<Map<string, RefObject<View | null>>>(new Map());
  // The live realtime channel, so handleChangeText can broadcast typing on it.
  const channelRef = useRef<RealtimeChannel | null>(null);
  // Timestamp of my last typing broadcast, used to throttle them.
  const lastTypingSentRef = useRef(0);
  // One pending "clear typing indicator" timer per remote user.
  const typingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const myUserId = session?.user.id;

  /**
   * Loads conversation metadata and membership:
   * 1. `get_conversation_info` RPC for group name/avatar/member count/role.
   * 2. All `conversation_members` rows with each member's profile joined in,
   *    to find my own status (accepted / request / left).
   * 3. For 1:1 chats only: the other person's profile and last_read_at
   *    (drives the "Seen" label), and whether I have blocked them.
   * Errors are not surfaced; missing data just leaves the defaults.
   */
  const loadMembers = useCallback(async () => {
    if (!id || !myUserId) return;
    // Group identity. `.maybeSingle()` returns null instead of throwing if the
    // RPC yields no row (e.g. I'm not a member).
    const { data: infoData } = await supabase.rpc('get_conversation_info', { p_conversation_id: id }).maybeSingle();
    const info = infoData as ConversationInfo | null;
    if (info) { setConversationInfo(info); conversationInfoRef.current = info; }

    // Every member plus their profile, via the `profiles:user_id(...)` foreign-key join.
    const { data } = await supabase
      .from('conversation_members')
      .select('user_id, status, last_read_at, profiles:user_id(id, username, full_name, avatar_url)')
      .eq('conversation_id', id);
    if (!data) return;
    const rows = data as unknown as { user_id: string; status: MemberStatus; last_read_at: string; profiles: OtherUser | null }[];
    const mine = rows.find((m) => m.user_id === myUserId);
    if (mine) setMyStatus(mine.status);

    // 1:1 only: "the other person" is the single non-me member. Groups use
    // conversationInfo for the header instead.
    if (!info?.is_group) {
      const other = rows.find((m) => m.user_id !== myUserId);
      if (other?.profiles) {
        setOtherUser(other.profiles);
        setOtherLastReadAt(other.last_read_at);
        // Only my own block rows are checked (I blocked them), which is what
        // the "You blocked X" bar and the Block/Unblock menu item reflect.
        const { data: blockRow } = await supabase.from('blocked_users').select('id').eq('blocker_id', myUserId).eq('blocked_id', other.profiles.id).maybeSingle();
        setMyBlocked(!!blockRow);
      }
    }
  }, [id, myUserId]);

  /**
   * Fills in displayable URLs for media messages. Rows from the database only
   * carry a storage `media_path`; because `message-media` is a private bucket,
   * each path is exchanged for a signed URL valid for 3600 seconds (1 hour).
   *
   * Rows that already have a `media_url`, or a `local_uri` (my own optimistic
   * message still showing the on-device file), are skipped. Single-file types
   * (image/video/voice/document) resolve `media_url` on the message; gallery
   * messages resolve each entry of `attachments`.
   *
   * @param rows messages to resolve
   * @returns a new array with signed URLs merged in (input rows are not mutated)
   */
  async function resolveMediaUrls(rows: LocalMessage[]): Promise<LocalMessage[]> {
    // A path that needs signing, and where to put the result: on the message
    // itself (attIndex undefined) or on attachment number attIndex.
    type Target = { path: string; rowId: string; attIndex?: number };
    const targets: Target[] = [];
    // Collect every path that still needs a URL.
    rows.forEach((r) => {
      if ((r.message_type === 'image' || r.message_type === 'video' || r.message_type === 'voice' || r.message_type === 'document') && r.media_path && !r.media_url && !r.local_uri) {
        targets.push({ path: r.media_path, rowId: r.id });
      }
      if (r.message_type === 'gallery') {
        (r.attachments ?? []).forEach((a, i) => {
          if (a.media_path && !a.media_url && !a.local_uri) targets.push({ path: a.media_path, rowId: r.id, attIndex: i });
        });
      }
    });
    if (targets.length === 0) return rows;

    // Sign all paths in parallel; results[i] lines up with targets[i].
    const results = await Promise.all(targets.map((t) => supabase.storage.from(MEDIA_BUCKET).createSignedUrl(t.path, 3600)));

    // Merge the signed URLs back into their rows.
    return rows.map((r) => {
      // Index of this row's single-file target (if any), and all of its
      // gallery-attachment targets paired with their signed URL.
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
        // Copy the attachments array so React sees a new reference.
        const atts = [...next.attachments];
        attUpdates.forEach(({ t, url }) => {
          if (url) atts[t.attIndex as number] = { ...atts[t.attIndex as number], media_url: url };
        });
        next = { ...next, attachments: atts };
      }
      return next;
    });
  }

  /**
   * Loads the newest page of messages through the `get_conversation_messages`
   * RPC. The RPC hides anything older than my `cleared_at` (set by "Clear
   * chat") and joins reply previews, reactions, gallery attachments, and
   * shared-spot details, so the client does not need follow-up queries.
   * A full page means there may be older messages to load on scroll.
   */
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

  // Runs each time the screen gains focus, and its returned cleanup runs when
  // it loses focus. While focused it: loads data, marks the thread as read,
  // and keeps a realtime channel open for new messages, read receipts, and
  // typing indicators.
  useFocusEffect(
    useCallback(() => {
      if (!id || !myUserId) return;
      loadMembers();
      loadMessages();
      // Opening the thread counts as reading it: bump my last_read_at, then
      // refresh the unread badge on the Chat tab.
      supabase.rpc('mark_conversation_read', { p_conversation_id: id }).then(() => refreshUnreadCount());

      // One Supabase Realtime channel for this conversation. Realtime pushes
      // database changes (postgres_changes) and ad-hoc client messages
      // (broadcast) over a websocket. `messages` and `conversation_members`
      // were added to the supabase_realtime publication in the chat migrations.
      const channel: RealtimeChannel = supabase
        .channel(`conversation:${id}`)
        // New message in this conversation (from anyone, including my own
        // inserts echoing back).
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
          async (payload) => {
            // The realtime payload is just the raw `messages` row, without the
            // extra joined fields the RPC provides, so the blocks below fill in
            // what each message type needs before it is shown.
            let raw = payload.new as LocalMessage;
            // Groups show the sender's name above each bubble; look it up.
            // Read via the ref because conversationInfo state would be stale here.
            if (conversationInfoRef.current?.is_group && raw.sender_id !== myUserId) {
              const { data: sender } = await supabase.from('profiles').select('username, full_name').eq('id', raw.sender_id).maybeSingle();
              if (sender) raw = { ...raw, sender_username: sender.username, sender_full_name: sender.full_name };
            }
            // Gallery photos live in a separate message_attachments table.
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
            // A shared spot only carries shared_spot_id; fetch the preview
            // card details (title, photo, genre, place) from `spots`.
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
            // Sign any media paths, then merge into the list.
            const [row] = await resolveMediaUrls([raw]);
            setMessages((prev) => {
              // Already present (e.g. my own send finished first and swapped
              // the temp row for the real id): ignore the echo.
              if (prev.some((m) => m.id === row.id)) return prev;
              // It's the echo of one of my optimistic sends that hasn't been
              // confirmed yet: replace the temp row in place, keeping its
              // position and any local-only fields (like local_uri).
              if (row.client_generated_id) {
                const idx = prev.findIndex((m) => m.pending && m.client_generated_id === row.client_generated_id);
                if (idx !== -1) {
                  const next = [...prev];
                  next[idx] = { ...prev[idx], ...row, pending: false };
                  return next;
                }
              }
              // Otherwise it's genuinely new: prepend (index 0 = newest).
              return [{ ...row, pending: false }, ...prev];
            });
            // A message from someone else: they've stopped typing, so drop
            // their indicator and its timer, and since I'm looking at the
            // thread, mark it read right away.
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
        // Read receipts: another member's last_read_at moved forward. This
        // drives the "Seen" label under my latest message. Any non-me member
        // updates it, so in a group it reflects whoever updated last.
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${id}` },
          (payload) => {
            const row = payload.new as { user_id: string; last_read_at: string };
            if (row.user_id !== myUserId) setOtherLastReadAt(row.last_read_at);
          }
        )
        // Typing indicators are broadcast messages: they go straight between
        // clients on this channel and are never stored in the database.
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          const typerId: string | undefined = payload?.user_id;
          const typerName: string = payload?.name || 'traveler';
          if (!typerId || typerId === myUserId) return;

          // Add/update the typer; return the same Map if nothing changed to
          // avoid a pointless re-render.
          setTypingUsers((prev) => {
            if (prev.get(typerId) === typerName) return prev;
            const next = new Map(prev);
            next.set(typerId, typerName);
            return next;
          });

          // Restart this person's expiry timer: if no new typing event
          // arrives within TYPING_TIMEOUT_MS, remove their indicator.
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

      // Cleanup on blur/unmount: stop all typing timers, close the channel,
      // and refresh the unread badge once more on the way out.
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

  /**
   * Loads the next page of older messages. Called by the FlatList's
   * onEndReached, which (because the list is inverted) fires when the user
   * scrolls up near the oldest loaded message. Uses the oldest message's
   * created_at as the `p_before` cursor and appends the page to the end of the
   * array (the top of the screen). Skips if there's nothing more, a page is
   * already loading, or the list is empty.
   */
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

  /**
   * Composer onChangeText. Updates the draft and broadcasts a "typing" event
   * to the other members, throttled to at most one every 1.5 seconds so a
   * fast typist doesn't flood the channel. Receivers expire the indicator
   * after TYPING_TIMEOUT_MS, so the throttle interval must stay below that.
   */
  function handleChangeText(t: string) {
    setText(t);
    const now = Date.now();
    if (channelRef.current && now - lastTypingSentRef.current > 1500) {
      lastTypingSentRef.current = now;
      const myName = profile?.username || profile?.full_name || 'traveler';
      channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { user_id: myUserId, name: myName } });
    }
  }

  /**
   * Sends a text message, or retries a failed one.
   *
   * Optimistic flow (shared by every send function in this file):
   * 1. Create a client id and a temp id (`temp-<clientId>`), or reuse both
   *    from `retryOf` so the retry updates the same bubble.
   * 2. Show a pending temp message right away (or flip the failed one back to
   *    pending on retry).
   * 3. Insert into `messages` and read back the created row.
   * 4. On success swap the temp row for the real one; on failure mark it
   *    failed so MessageBubble shows a retry control.
   *
   * @param retryOf the failed message to resend; omitted for a fresh send
   *   from the composer (which also clears the draft and reply target).
   */
  async function sendMessage(retryOf?: LocalMessage) {
    if (!session || !id) return;
    const content = (retryOf?.content ?? text).trim();
    if (!content) return;
    const clientId = retryOf?.client_generated_id ?? generateClientId();
    const tempId = retryOf?.id ?? `temp-${clientId}`;
    // Retries are sent without a reply link (replyingTo belongs to the
    // current composer, not the failed message).
    const replyTo = retryOf ? null : replyingTo;

    // Show the message immediately, before the network round trip.
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

    // Write to the table directly (writes go through tables, reads through
    // RPCs). RLS rejects the insert if I'm not a member or either side has blocked the other.
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
      // Replying to a message request accepts it (the handle_new_message
      // trigger does this server-side); mirror it so the banner goes away.
      if (myStatus === 'request') setMyStatus('accepted');
    }
  }

  /**
   * Opens the photo library for up to 10 images and adds them to the
   * composer's tray (pickedAssets). Nothing is sent until the user taps send.
   * Photos are read as base64 because uploads go through base64-arraybuffer
   * (React Native has no usable Blob path for this).
   */
  async function pickImages() {
    if (!session || !id || pickingImages) return;
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
      // Drop any asset the picker couldn't encode, then append to the tray.
      const assets = result.assets.filter((a) => a.base64).map((a) => ({ uri: a.uri, base64: a.base64 as string }));
      setPickedAssets((prev) => [...prev, ...assets]);
    } finally {
      // `finally` also runs on the early returns above, so the flag always resets.
      setPickingImages(false);
    }
  }

  /**
   * Opens the camera and adds the captured photo to the composer's tray,
   * same as a picked library photo.
   */
  async function pickCamera() {
    if (!session || !id || pickingCamera) return;
    setPickingCamera(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow camera access to take a photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.9, base64: true });
      if (result.canceled || !result.assets[0]?.base64) return;
      const asset = result.assets[0];
      setPickedAssets((prev) => [...prev, { uri: asset.uri, base64: asset.base64 as string }]);
    } finally {
      setPickingCamera(false);
    }
  }

  /** Removes one photo from the composer tray (the "x" on its thumbnail). */
  function removePickedAsset(index: number) {
    setPickedAssets((prev) => prev.filter((_, i) => i !== index));
  }

  /**
   * The composer's send button. With photos in the tray it sends them, either
   * as a single gallery message (2+ photos in collage/grid mode) or as one
   * image message each, with the typed text used as the caption. With no
   * photos it sends a plain text message.
   */
  async function handleSend() {
    if (pickedAssets.length > 0) {
      // Snapshot and reset the composer first so the UI clears immediately.
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
          // Only the last photo carries the caption.
          await sendImageMessage(assets[i], undefined, i === assets.length - 1 ? caption : undefined);
        }
      }
    } else {
      sendMessage();
    }
  }

  /**
   * Sends one photo (or retries a failed one): shows a pending bubble using
   * the local file, uploads the JPEG to `<conversationId>/<userId>_<timestamp>.jpg`
   * in the message-media bucket, then inserts an `image` message pointing at
   * that path. Same optimistic flow as sendMessage.
   *
   * @param asset the picked photo (uri for the preview, base64 for the upload)
   * @param retryOf the failed message to resend, if retrying
   * @param caption optional caption text stored in `content`
   */
  async function sendImageMessage(asset: { uri: string; base64: string }, retryOf?: LocalMessage, caption?: string) {
    if (!session || !id) return;
    const clientId = retryOf?.client_generated_id ?? generateClientId();
    const tempId = retryOf?.id ?? `temp-${clientId}`;
    const captionText = retryOf ? retryOf.content : (caption || '');

    if (retryOf) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: true, failed: false } : m)));
    } else {
      // Keep local_uri for the instant preview and _base64 so a failure can
      // be retried without re-picking the photo.
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

    // Upload first. The first folder must be the conversation id: storage
    // RLS checks membership against it.
    const path = `${id}/${session.user.id}_${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, decode(asset.base64), { contentType: 'image/jpeg' });
    if (uploadError) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
      return;
    }

    // Then create the message row that references the uploaded file.
    const { data, error } = await supabase
      .from('messages')
      .insert({ conversation_id: id, sender_id: session.user.id, message_type: 'image', media_path: path, content: captionText || null, client_generated_id: clientId })
      .select()
      .single();

    if (error || !data) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
    } else {
      // local_uri stays on the merged row, so the bubble keeps showing the
      // on-device file instead of downloading it again.
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, ...data, pending: false } : m)));
      if (myStatus === 'request') setMyStatus('accepted');
    }
  }

  /**
   * Picks one video from the library, rejects anything longer than
   * MAX_VIDEO_SECONDS, and hands it to sendVideoMessage. Unlike photos, a
   * video sends right away rather than going into the composer tray.
   */
  async function pickVideo() {
    if (!session || !id || pickingVideo) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to send a video.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    // The picker reports duration in milliseconds; store whole seconds.
    const durationSeconds = asset.duration ? Math.round(asset.duration / 1000) : null;
    if (durationSeconds && durationSeconds > MAX_VIDEO_SECONDS) {
      Alert.alert('Video too long', `Please choose a video under ${MAX_VIDEO_SECONDS} seconds.`);
      return;
    }
    sendVideoMessage({ uri: asset.uri, durationSeconds });
  }

  /**
   * Sends (or retries) a video message: pending bubble, upload the .mp4, then
   * insert a `video` message with its duration. Errors from either step land
   * in the catch and mark the bubble failed. `pickingVideo` is held during the
   * upload so the video button can't start a second one.
   */
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

  /**
   * Sends (or retries) a voice message as an .m4a file: pending bubble,
   * upload, then insert a `voice` message with its duration. Used both for
   * notes recorded in the composer (onSendVoice) and for audio files picked
   * from the device (see pickDocument).
   */
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
      // Same fetch+arrayBuffer upload as video (no base64 copy in memory).
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

  /**
   * Opens the system document picker. Audio files are routed to
   * sendVoiceMessage (after reading their duration); everything else is sent
   * as a `document` message.
   *
   * @param audioOnly true when opened from the composer's "audio" option,
   *   which limits the picker to audio MIME types.
   */
  async function pickDocument(audioOnly: boolean = false) {
    if (!session || !id || pickingDocument) return;
    // copyToCacheDirectory gives a local file URI that fetch() can read for upload.
    const result = await DocumentPicker.getDocumentAsync({ type: audioOnly ? 'audio/*' : '*/*', copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    if (asset.mimeType?.startsWith('audio/')) {
      // A song/audio file picked from the phone gets the same cassette-player
      // treatment as a recorded voice note, not a generic file card.
      setPickingDocument(true);
      let durationSeconds: number | null = null;
      try {
        // probeAudioDuration (lib/media.ts) loads the file just long enough to
        // read its length, with a timeout; null if it can't tell.
        durationSeconds = await probeAudioDuration(asset.uri);
      } finally {
        setPickingDocument(false);
      }
      sendVoiceMessage({ uri: asset.uri, durationSeconds });
      return;
    }
    sendDocumentMessage({ uri: asset.uri, name: asset.name, size: asset.size ?? null, mimeType: asset.mimeType ?? null });
  }

  /**
   * Sends (or retries) a file attachment: pending file card, upload with the
   * original extension and MIME type, then insert a `document` message with
   * the file name and size for display.
   */
  async function sendDocumentMessage(asset: { uri: string; name: string; size: number | null; mimeType?: string | null }, retryOf?: LocalMessage) {
    if (!session || !id) return;
    const clientId = retryOf?.client_generated_id ?? generateClientId();
    const tempId = retryOf?.id ?? `temp-${clientId}`;
    // On retry, prefer what the failed message recorded over the passed asset.
    const name = retryOf ? (retryOf.file_name ?? asset.name) : asset.name;
    const size = retryOf ? (retryOf.file_size ?? asset.size) : asset.size;
    const mimeType = retryOf ? retryOf._mimeType : asset.mimeType;

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
        message_type: 'document',
        local_uri: asset.uri,
        file_name: name,
        file_size: size,
        _mimeType: asset.mimeType,
      };
      setMessages((prev) => [temp, ...prev]);
    }

    setPickingDocument(true);
    try {
      // Keep the original file extension (e.g. ".pdf") on the storage path, if it has one.
      const extMatch = name.match(/\.[a-zA-Z0-9]+$/);
      const path = `${id}/${session.user.id}_${Date.now()}${extMatch ? extMatch[0] : ''}`;
      const response = await fetch(asset.uri);
      const arrayBuffer = await response.arrayBuffer();
      const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, arrayBuffer, { contentType: mimeType ?? undefined });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('messages')
        .insert({ conversation_id: id, sender_id: session.user.id, message_type: 'document', media_path: path, file_name: name, file_size: size, client_generated_id: clientId })
        .select()
        .single();
      if (error || !data) throw error ?? new Error('insert failed');

      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, ...data, pending: false } : m)));
      if (myStatus === 'request') setMyStatus('accepted');
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)));
    } finally {
      setPickingDocument(false);
    }
  }

  /**
   * Sends (or retries) several photos as one `gallery` message laid out as a
   * collage or grid. Steps: pending bubble with local previews, upload all
   * photos in parallel, insert the `messages` row, then insert one
   * `message_attachments` row per photo (with its position for ordering).
   * Other clients may receive the messages row over realtime before the
   * attachments exist, which the INSERT handler above covers with a retry.
   *
   * @param assets photos to send (ignored on retry; retryOf._base64s is used)
   * @param caption text stored in `content`
   * @param retryOf the failed gallery message to resend, if retrying
   * @param layout 'collage' or 'grid' (defaults to collage)
   */
  async function sendGalleryMessage(assets: { uri: string; base64: string }[], caption: string, retryOf?: LocalMessage, layout?: 'collage' | 'grid') {
    if (!session || !id) return;
    const clientId = retryOf?.client_generated_id ?? generateClientId();
    const tempId = retryOf?.id ?? `temp-${clientId}`;
    const captionText = retryOf ? retryOf.content : (caption || '');
    const galleryLayout = retryOf ? (retryOf.gallery_layout ?? 'collage') : (layout ?? 'collage');
    // Finds this send's bubble. The realtime echo of the `messages` insert can
    // swap the temp row for the server row (new id) before the photo rows
    // are saved, so match on client_generated_id too, not only the temp id.
    const isThisBubble = (m: LocalMessage) => m.id === tempId || m.client_generated_id === clientId;

    if (retryOf) {
      setMessages((prev) => prev.map((m) => (isThisBubble(m) ? { ...m, pending: true, failed: false } : m)));
    } else {
      // attachments carry local previews; _base64s keeps the data for retries.
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

    // On retry, rebuild the upload list from the data saved on the failed message.
    const uploadAssets = retryOf
      ? (retryOf._base64s ?? []).map((base64, i) => ({ base64, uri: retryOf.attachments?.[i]?.local_uri ?? '' }))
      : assets;

    try {
      // Upload every photo in parallel; the `_${i}` suffix keeps paths unique
      // since they share the same Date.now() timestamp. Any failure throws.
      const paths = await Promise.all(
        uploadAssets.map(async (a, i) => {
          const path = `${id}/${session.user.id}_${Date.now()}_${i}.jpg`;
          const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, decode(a.base64), { contentType: 'image/jpeg' });
          if (error) throw error;
          return path;
        })
      );

      // The parent message row (no media_path itself; photos live in attachments).
      // If an earlier attempt already created it (see _serverMessageId), re-read
      // that row instead of inserting a duplicate. The app can't delete the
      // orphan row instead: `messages` has no DELETE policy for clients.
      const existingId = retryOf?._serverMessageId;
      const { data, error } = existingId
        ? await supabase.from('messages').select().eq('id', existingId).single()
        : await supabase
          .from('messages')
          .insert({ conversation_id: id, sender_id: session.user.id, message_type: 'gallery', gallery_layout: galleryLayout, content: captionText || null, client_generated_id: clientId })
          .select()
          .single();
      if (error || !data) throw error ?? new Error('insert failed');

      // One attachment row per photo, ordered by `position`. On failure,
      // remember the server row's id on the bubble so Retry reuses it.
      const { error: attError } = await supabase
        .from('message_attachments')
        .insert(paths.map((media_path, position) => ({ message_id: data.id, media_path, position })));
      if (attError) {
        setMessages((prev) => prev.map((m) => (isThisBubble(m) ? { ...m, _serverMessageId: data.id } : m)));
        throw attError;
      }

      // Swap in the real row, keeping each attachment's local preview and
      // adding its storage path.
      setMessages((prev) => prev.map((m) => {
        if (!isThisBubble(m)) return m;
        const mergedAttachments = paths.map((media_path, i) => ({ ...(m.attachments?.[i] ?? {}), media_path }));
        return { ...m, ...data, pending: false, attachments: mergedAttachments };
      }));
      if (myStatus === 'request') setMyStatus('accepted');
    } catch {
      setMessages((prev) => prev.map((m) => (isThisBubble(m) ? { ...m, pending: false, failed: true } : m)));
    }
  }

  /**
   * Shares my current location as a `location` message (or retries one).
   * On a fresh share it asks for location via useUserLocation, builds a
   * label (a "city, region, country" reverse-geocode, falling back to the
   * raw coordinates), and only then shows the pending bubble. A retry reuses
   * the coordinates and label already stored on the failed message.
   */
  async function shareLocation(retryOf?: LocalMessage) {
    if (!session || !id) return;
    // Ignore repeat taps while a fresh share is still resolving.
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
      // Requests permission if needed; null means denied or unavailable.
      const coords = await refreshLocation();
      if (!coords) {
        setSharingLocation(false);
        Alert.alert('Location unavailable', 'Allow location access to share your location.');
        return;
      }
      lat = coords.lat;
      lng = coords.lng;
      // "City, Region, Country" via the device geocoder with an OpenStreetMap
      // fallback (lib/geocoding.ts); if both fail, show the coordinates to
      // 4 decimal places. Geocoding is a nice-to-have here.
      label = (await placeLabel(coords.lat, coords.lng)) ?? `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
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

    // No upload needed; the coordinates go straight into the message row.
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

  /**
   * Retry button on a failed bubble. Routes the message back to the send
   * function for its type, rebuilding the original asset from the local-only
   * fields saved on the failed message (local_uri, _base64, _base64s,
   * _mimeType). Media retries are skipped if that local data is missing.
   * Anything that isn't a known media type is retried as text.
   */
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
    } else if (item.message_type === 'document') {
      if (item.local_uri) sendDocumentMessage({ uri: item.local_uri, name: item.file_name ?? 'File', size: item.file_size ?? null, mimeType: item._mimeType }, item);
    } else {
      sendMessage(item);
    }
  }

  /**
   * "Accept" on the message-request banner: sets my own conversation_members
   * status to 'accepted' so the chat moves into my normal inbox.
   * The update's result isn't checked; local state is updated regardless.
   */
  async function acceptRequest() {
    if (!session || !id) return;
    await supabase.from('conversation_members').update({ status: 'accepted' }).eq('conversation_id', id).eq('user_id', session.user.id);
    setMyStatus('accepted');
  }

  /**
   * Adds or removes my emoji reaction on a message. Updates the bubble
   * optimistically, then deletes or inserts the matching `message_reactions`
   * row (unique per message + user + emoji). The server result isn't
   * checked, so a failure isn't rolled back.
   */
  async function toggleReaction(message: LocalMessage, emoji: string) {
    if (!myUserId) return;
    // Have I already reacted with this emoji? Then this tap removes it.
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

  /**
   * "Clear chat": the `clear_conversation` RPC sets my `cleared_at` to now, so
   * get_conversation_messages hides everything older for me only (the other
   * members keep their history). Then reloads the now-empty list.
   */
  async function handleClear() {
    if (!id) return;
    await supabase.rpc('clear_conversation', { p_conversation_id: id });
    loadMessages();
  }
  /**
   * "Delete chat" (1:1 only), after a confirm dialog. The `delete_conversation`
   * RPC marks my membership as 'left' and clears my history, which removes it
   * from my inbox; a later message from the other person brings it back (the
   * handle_new_message trigger), without the old history. Then navigates back.
   */
  function handleDelete() {
    Alert.alert('Delete this chat?', 'It will be removed from your inbox. The other person keeps their copy.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.rpc('delete_conversation', { p_conversation_id: id }); router.back(); } },
    ]);
  }
  /**
   * "Leave group", after a confirm dialog. Calls `leave_group_conversation`;
   * shows the server's error message if it refuses, otherwise navigates back.
   */
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
  /**
   * Block / unblock the other person (1:1 only). Unblocking happens at once;
   * blocking asks for confirmation first. It writes `blocked_users` rows; the
   * messages insert RLS policy is what actually stops messages between a
   * blocked pair.
   */
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
  /**
   * Files a report against the other person through the `report_content` RPC
   * with the reason chosen in the report sheet, then thanks the user.
   */
  async function submitReport(reason: string) {
    if (!otherUser) return;
    await supabase.rpc('report_content', { p_target_type: 'user', p_target_id: otherUser.id, p_reason: reason });
    Alert.alert('Reported', "Thanks — we'll review this.");
  }
  /**
   * Opens the "..." chat menu. Waits until we know what the conversation is
   * (a group, or a 1:1 with the other person loaded), since the menu options
   * depend on it.
   */
  function openMenu() {
    if (!conversationInfo?.is_group && !otherUser) return;
    setMenuVisible(true);
  }

  // The three getters below lazily create one stable React ref per bubble
  // and cache it in a Map, so the same ref object is reused across renders
  // (a new createRef on every render would lose the attached view).

  /** Ref for an image message's polaroid-styled view, keyed by message id. */
  function getPolaroidRef(id: string): RefObject<View | null> {
    if (!polaroidRefsMap.current.has(id)) polaroidRefsMap.current.set(id, createRef<View>());
    return polaroidRefsMap.current.get(id)!;
  }

  /** Ref for a whole gallery bubble's view, keyed by message id. */
  function getGalleryRef(id: string): RefObject<View | null> {
    if (!galleryRefsMap.current.has(id)) galleryRefsMap.current.set(id, createRef<View>());
    return galleryRefsMap.current.get(id)!;
  }

  /** Ref for one photo inside a gallery, keyed by "messageId:index". */
  function getAttachmentRef(messageId: string, index: number): RefObject<View | null> {
    const key = `${messageId}:${index}`;
    if (!attachmentRefsMap.current.has(key)) attachmentRefsMap.current.set(key, createRef<View>());
    return attachmentRefsMap.current.get(key)!;
  }

  // Save helpers. The "polaroid"/"gallery" variants capture the styled
  // on-screen view as a JPEG (saveViewAsImage); handleSavePhoto saves the
  // original file itself. Each reports the outcome with an Alert:
  // `ok === false` means photo-library permission was refused.

  /** Saves one photo from a gallery as a polaroid (from the image viewer). */
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

  /** Saves a whole gallery bubble (collage/grid) as a single image. */
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

  /** Saves the original photo file (local copy if I sent it, else the signed URL). */
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

  /** Saves an image message as it looks in its polaroid frame. */
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

  // Values derived for rendering.
  const isGroup = !!conversationInfo?.is_group;
  // Header title: group name, or the other person's username / full name.
  const name = isGroup ? (conversationInfo?.name || 'Group') : (otherUser?.username || otherUser?.full_name || 'traveler');
  // "Seen" shows only when the newest message (index 0) is mine and the other
  // side's last_read_at is at or after it. ISO timestamps compare correctly
  // as strings.
  const lastMineIndex = messages.findIndex((m) => m.sender_id === myUserId);
  const lastMineSeen = lastMineIndex === 0 && !!otherLastReadAt && !!messages[0] && otherLastReadAt >= messages[0].created_at;

  // Header subtitle while people are typing. Groups name who is typing
  // ("A is typing…", "A and B are typing…", "A and N others are typing…");
  // a 1:1 chat just says "typing…".
  const typingNames = Array.from(typingUsers.values());
  const typingLabel = isGroup
    ? typingNames.length === 0 ? null
      : typingNames.length === 1 ? `${typingNames[0]} is typing…`
      : typingNames.length === 2 ? `${typingNames[0]} and ${typingNames[1]} are typing…`
      : `${typingNames[0]} and ${typingNames.length - 1} others are typing…`
    : typingNames.length > 0 ? 'typing…' : null;

  // Layout: fixed header, then a KeyboardAvoidingView holding the message
  // list, request banner, reply bar, and composer (or blocked bar), then the
  // modal sheets/viewers, which float above everything.
  return (
    <ScreenBackground>
      {/* Hide the default stack header; this screen draws its own. */}
      <Stack.Screen options={{ headerShown: false }} />

      {/* Fixed header — stays put; only the message area + composer below react to the keyboard. */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Go back" style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        {/* Avatar + name block; tapping opens group info or the other person's profile. */}
        <Pressable
          style={styles.headerInfo}
          onPress={() => {
            if (isGroup) router.push({ pathname: '/group/[id]', params: { id: id as string } });
            else if (otherUser) router.push({ pathname: '/user/[id]', params: { id: otherUser.id } });
          }}>
          {/* Group: its photo, or a people icon on gold. 1:1: the other person's avatar. */}
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
            {/* Subtitle: the typing label wins; otherwise groups show their member count. */}
            {typingLabel ? (
              <Text style={styles.typingText} numberOfLines={1}>{typingLabel}</Text>
            ) : isGroup ? (
              <Text style={styles.memberCountText}>{conversationInfo?.member_count ?? 0} members</Text>
            ) : null}
          </View>
        </Pressable>
        {/* Right side: in-thread message search, then the "..." chat menu. */}
        <Pressable onPress={() => setSearchVisible(true)} accessibilityLabel="Search messages" style={styles.menuBtn}>
          <Ionicons name="search-outline" size={19} color={theme.color.cream} />
        </Pressable>
        <Pressable onPress={openMenu} accessibilityLabel="More options" style={styles.menuBtn}>
          <Ionicons name="ellipsis-vertical" size={18} color={theme.color.cream} />
        </Pressable>
      </View>

      {/* Everything below the header moves up with the keyboard ("padding" adds bottom padding equal to the keyboard height). */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {/* Message area: loading spinner, empty state, or the message list. */}
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
                {/* MessageBubble renders every message type; this screen wires up its callbacks. */}
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
                  onPressDocument={(url) => Linking.openURL(url).catch(() => Alert.alert('Could not open file', 'Try again in a moment.'))}
                  polaroidRef={item.message_type === 'image' ? getPolaroidRef(item.id) : undefined}
                  galleryRef={item.message_type === 'gallery' ? getGalleryRef(item.id) : undefined}
                  getAttachmentRef={item.message_type === 'gallery' ? (index) => getAttachmentRef(item.id, index) : undefined}
                />
                {/* "Seen" receipt, only under my newest message (index 0 in the inverted list). */}
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

        {/* Message-request banner: someone I'm not connected with messaged me; Accept moves it to my inbox. */}
        {myStatus === 'request' && <RequestBanner name={name} onAccept={acceptRequest} />}

        {/* Reply preview above the composer while replying to a message, with a cancel button. */}
        {replyingTo && (
          <View style={styles.replyBar}>
            <View style={{ flex: 1 }}>
              <Text style={styles.replyBarName}>Replying to {replyingTo.sender_id === myUserId ? 'yourself' : name}</Text>
              <Text style={styles.replyBarText} numberOfLines={1}>{replyingTo.content}</Text>
            </View>
            <Pressable onPress={() => setReplyingTo(null)} accessibilityLabel="Cancel reply"><Ionicons name="close" size={16} color={theme.color.muted} /></Pressable>
          </View>
        )}

        {/* Bottom bar: if I've blocked this person, an Unblock bar replaces the composer. */}
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
            onPickCamera={pickCamera}
            pickingImages={pickingImages}
            pickingCamera={pickingCamera}
            onPickVideo={pickVideo}
            pickingVideo={pickingVideo}
            onShareLocation={() => shareLocation()}
            sharingLocation={sharingLocation}
            pickedAssets={pickedAssets}
            onRemoveAsset={removePickedAsset}
            sendMode={sendMode}
            onChangeSendMode={setSendMode}
            onSendVoice={(uri, durationSeconds) => sendVoiceMessage({ uri, durationSeconds })}
            onPickDocument={() => pickDocument(false)}
            onPickAudio={() => pickDocument(true)}
            pickingDocument={pickingDocument}
            paddingBottom={Math.max(insets.bottom, 16) + 16}
          />
        )}
      </KeyboardAvoidingView>

      {/* Long-press sheet on a message: reply, react, and (for photos) save options. */}
      <MessageActionSheet
        visible={!!actionSheetFor}
        onClose={() => setActionSheetFor(null)}
        onReply={() => actionSheetFor && setReplyingTo(actionSheetFor)}
        onReact={(emoji) => actionSheetFor && toggleReaction(actionSheetFor, emoji)}
        showSaveOptions={actionSheetFor?.message_type === 'image'}
        onSavePhoto={() => actionSheetFor && handleSavePhoto(actionSheetFor)}
        onSaveAsPolaroid={() => actionSheetFor && handleSaveAsPolaroid(actionSheetFor)}
      />

      {/* The "..." chat menu. Groups: clear / group info / leave. 1:1: clear / delete / block / report. */}
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

      {/* Report reasons, opened from "Report" in the chat menu. Each maps to a report_content reason code. */}
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

      {/* Full-screen photo viewer. "Save as polaroid" is offered for image messages and for a single photo opened from a gallery. */}
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

      {/* In-thread message search overlay; only mounted once both ids are known. */}
      {id && myUserId && (
        <MessageSearchOverlay visible={searchVisible} conversationId={id} myUserId={myUserId} onClose={() => setSearchVisible(false)} />
      )}

      {/* Full-screen video player for tapped video messages. */}
      <VideoViewerModal visible={!!videoViewerUri} uri={videoViewerUri} onClose={() => setVideoViewerUri(null)} />
    </ScreenBackground>
  );
}

// Styles use the design tokens (colors, fonts, radii) from constants/theme.ts.
const styles = StyleSheet.create({
  // Shared centering for the loading and empty states
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Header
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.color.surface2, backgroundColor: theme.color.dusk },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerName: { fontFamily: theme.font.body, fontSize: 15, color: theme.color.cream },
  typingText: { fontFamily: theme.font.bodyRegular, fontSize: 11, color: theme.color.gold, marginTop: 1 },
  memberCountText: { fontFamily: theme.font.bodyRegular, fontSize: 11, color: theme.color.muted, marginTop: 1 },
  groupHeaderAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: theme.color.gold, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  groupHeaderAvatarImage: { width: '100%', height: '100%' },
  menuBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  // Message list; flexGrow + flex-end keeps a short thread pinned to the bottom
  listContent: { paddingHorizontal: 14, paddingTop: 14, flexGrow: 1, justifyContent: 'flex-end' },
  emptyText: { fontFamily: theme.font.bodyRegular, fontSize: 13, color: theme.color.muted, textAlign: 'center' },
  seenText: { fontFamily: theme.font.mono, fontSize: 9.5, color: theme.color.muted, textAlign: 'right', marginRight: 4, marginTop: -2, marginBottom: 4 },
  // Reply preview bar
  replyBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.color.surface, borderTopWidth: 1, borderTopColor: theme.color.surface2 },
  replyBarName: { fontFamily: theme.font.body, fontSize: 11.5, color: theme.color.gold },
  replyBarText: { fontFamily: theme.font.bodyRegular, fontSize: 12, color: theme.color.muted, marginTop: 1 },
  // Blocked bar (replaces the composer)
  blockedBar: { paddingTop: 14, paddingHorizontal: 20, alignItems: 'center', gap: 8, borderTopWidth: 1, borderTopColor: theme.color.surface2, backgroundColor: theme.color.dusk },
  blockedText: { fontFamily: theme.font.bodyRegular, fontSize: 12.5, color: theme.color.muted },
  unblockBtn: { borderWidth: 1, borderColor: theme.color.gold, borderRadius: theme.radius.sm, paddingVertical: 8, paddingHorizontal: 16 },
  unblockText: { fontFamily: theme.font.body, fontSize: 12.5, color: theme.color.gold },
});
