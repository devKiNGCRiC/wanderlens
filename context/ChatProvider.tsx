/**
 * ChatProvider: app-wide unread-conversation count for the Chat tab badge.
 *
 * Purpose: the Chat tab icon (app/(tabs)/_layout.tsx) shows how many
 * conversations have unread messages. This provider keeps that number live and
 * exposes it through `useChat()`. It is mounted in app/_layout.tsx inside
 * AuthProvider (it needs the session).
 *
 * How it works:
 * - Reads the count from the `get_unread_conversation_count` RPC (a Postgres
 *   function called with `supabase.rpc`).
 * - Subscribes to Supabase Realtime INSERT events on `messages` and re-fetches
 *   the count, debounced to 400 ms so a burst of messages causes one request.
 * - Re-fetches when the app returns to the foreground (AppState).
 * - Screens call `refreshUnreadCount()` after marking a conversation read
 *   (app/chat/[id].tsx, app/(tabs)/chat.tsx).
 *
 * Gotcha: NotificationsProvider.tsx is a near-copy of this file for the
 * notification bell; a fix to one usually belongs in the other too.
 */
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';

/** What `useChat()` returns. */
type ChatContextType = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
};

// Defaults used only outside the provider: zero badge, no-op refresh.
const ChatContext = createContext<ChatContextType>({
  unreadCount: 0,
  refreshUnreadCount: async () => {},
});

/**
 * Hook for the unread-conversation badge.
 * @returns `unreadCount` and `refreshUnreadCount()` to re-sync it on demand.
 */
export function useChat() {
  return useContext(ChatContext);
}

/** Provider that keeps the unread-conversation count in sync for the signed-in user. */
export function ChatProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  // Holds the pending debounce timer; a ref so updating it doesn't re-render.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetches the current count from the server. Errors are ignored, leaving
  // the last known count on screen.
  async function refreshUnreadCount() {
    if (!session) return;
    const { data, error } = await supabase.rpc('get_unread_conversation_count');
    if (!error && typeof data === 'number') setUnreadCount(data);
  }

  // Re-runs whenever the signed-in user changes (sign-in, sign-out, switch).
  useEffect(() => {
    // Signed out: clear the badge and set up no subscriptions.
    if (!session) {
      setUnreadCount(0);
      return;
    }

    // Initial load for this user.
    refreshUnreadCount();

    // Unfiltered on purpose — Realtime re-checks the `messages` SELECT RLS
    // policy per row, so this self-narrows to conversations the user is in
    // without needing to resubscribe as their conversation list changes.
    const channel = supabase
      .channel('messages-unread-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
        // Debounce: restart the 400 ms timer on each insert, fetch once it settles.
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(refreshUnreadCount, 400);
      })
      .subscribe();

    // Realtime sockets die while the app is backgrounded — re-sync the badge
    // as a safety net whenever the app returns to the foreground.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshUnreadCount();
    });

    // Cleanup on user change or unmount: cancel the timer, drop the channel and listener.
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
      appStateSub.remove();
    };
    // Keyed on the user id rather than the session object, so a token refresh
    // (new session object, same user) doesn't tear down the Realtime channel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  return (
    <ChatContext.Provider value={{ unreadCount, refreshUnreadCount }}>
      {children}
    </ChatContext.Provider>
  );
}
