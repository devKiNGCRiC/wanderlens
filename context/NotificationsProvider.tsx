/**
 * NotificationsProvider: app-wide unread count for the notification bell.
 *
 * Purpose: the bell on the Feed tab (app/(tabs)/index.tsx) shows how many
 * unread in-app notifications the user has (connection requests, likes,
 * comments, message requests, etc., all written by database triggers). This
 * provider keeps that number live and exposes it through `useNotifications()`.
 * It is mounted in app/_layout.tsx inside AuthProvider (it needs the session).
 *
 * How it works:
 * - Reads the count from the `get_unread_notification_count` RPC (a Postgres
 *   function called with `supabase.rpc`).
 * - Subscribes to Supabase Realtime INSERT events on `notifications` and
 *   re-fetches the count, debounced to 400 ms.
 * - Re-fetches when the app returns to the foreground (AppState).
 * - app/notifications.tsx calls `refreshUnreadCount()` after marking items read.
 *
 * Gotcha: this is a near-copy of ChatProvider.tsx; a fix to one usually
 * belongs in the other too.
 */
import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';

/** What `useNotifications()` returns. */
type NotificationsContextType = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
};

// Defaults used only outside the provider: zero badge, no-op refresh.
const NotificationsContext = createContext<NotificationsContextType>({
  unreadCount: 0,
  refreshUnreadCount: async () => {},
});

/**
 * Hook for the notification-bell badge.
 * @returns `unreadCount` and `refreshUnreadCount()` to re-sync it on demand.
 */
export function useNotifications() {
  return useContext(NotificationsContext);
}

/** Provider that keeps the unread-notification count in sync for the signed-in user. */
export function NotificationsProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  // Holds the pending debounce timer; a ref so updating it doesn't re-render.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetches the current count from the server. Errors are ignored, leaving
  // the last known count on screen.
  async function refreshUnreadCount() {
    if (!session) return;
    const { data, error } = await supabase.rpc('get_unread_notification_count');
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

    // Unfiltered on purpose — Realtime re-checks the `notifications` SELECT
    // RLS policy per row, so this self-narrows to the signed-in user's own
    // rows without needing a per-user channel filter.
    const channel = supabase
      .channel('notifications-unread-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
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
    <NotificationsContext.Provider value={{ unreadCount, refreshUnreadCount }}>
      {children}
    </NotificationsContext.Provider>
  );
}
