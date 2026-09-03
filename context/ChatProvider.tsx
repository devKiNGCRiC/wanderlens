import { createContext, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthProvider';

type ChatContextType = {
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
};

const ChatContext = createContext<ChatContextType>({
  unreadCount: 0,
  refreshUnreadCount: async () => {},
});

export function useChat() {
  return useContext(ChatContext);
}

export function ChatProvider({ children }: PropsWithChildren) {
  const { session } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refreshUnreadCount() {
    if (!session) return;
    const { data, error } = await supabase.rpc('get_unread_conversation_count');
    if (!error && typeof data === 'number') setUnreadCount(data);
  }

  useEffect(() => {
    if (!session) {
      setUnreadCount(0);
      return;
    }

    refreshUnreadCount();

    // Unfiltered on purpose — Realtime re-checks the `messages` SELECT RLS
    // policy per row, so this self-narrows to conversations the user is in
    // without needing to resubscribe as their conversation list changes.
    const channel = supabase
      .channel('messages-unread-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => {
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
    <ChatContext.Provider value={{ unreadCount, refreshUnreadCount }}>
      {children}
    </ChatContext.Provider>
  );
}
