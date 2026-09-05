import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';

type NotificationsContextType = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextType>({
  unreadCount: 0,
  refreshUnreadCount: async () => {},
});

export function useNotifications() {
  return useContext(NotificationsContext);
}

export function NotificationsProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refreshUnreadCount() {
    if (!session) return;
    const { data, error } = await supabase.rpc('get_unread_notification_count');
    if (!error && typeof data === 'number') setUnreadCount(data);
  }

  useEffect(() => {
    if (!session) {
      setUnreadCount(0);
      return;
    }

    refreshUnreadCount();

    // Unfiltered on purpose — Realtime re-checks the `notifications` SELECT
    // RLS policy per row, so this self-narrows to the signed-in user's own
    // rows without needing a per-user channel filter.
    const channel = supabase
      .channel('notifications-unread-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(refreshUnreadCount, 400);
      })
      .subscribe();

    // Realtime sockets die while the app is backgrounded — re-sync the badge
    // as a safety net whenever the app returns to the foreground.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshUnreadCount();
    });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
      appStateSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user.id]);

  return (
    <NotificationsContext.Provider value={{ unreadCount, refreshUnreadCount }}>
      {children}
    </NotificationsContext.Provider>
  );
}
