//AuthProvider.tsx
import { createContext, useContext, useEffect, useState, useCallback, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

type RecoveryTokens = { access_token: string; refresh_token: string };

// Supabase's recovery email link puts the tokens in the URL fragment
// (`wanderlens://reset-password#access_token=...&refresh_token=...&type=recovery`)
// — a web-oriented format (mirrors `window.location.hash`) that Supabase sends
// regardless of platform. `detectSessionInUrl: false` in lib/supabase.js means
// the client never parses this automatically (there's no browser location to
// read on native), so this app has to do it by hand.
function parseRecoveryTokens(url: string | null): RecoveryTokens | null {
  if (!url) return null;
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  if (params.get('type') !== 'recovery') return null;
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

type Profile = {
  id: string;
  full_name: string | null;
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  user_type: string | null;
  photography_genres: string[] | null;
  place_interests: string[] | null;
  travel_style: string | null;
  home_city: string | null;
  country: string | null;
  onboarded: boolean;
};

type AuthContextType = {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  // Non-null exactly while the user is mid password-reset (arrived via the
  // recovery email link). Deliberately independent of `session` — see the
  // guard in app/_layout.tsx: establishing a session to call
  // auth.updateUser() would otherwise look identical to a normal login and
  // get routed straight into the app before the user sets a new password.
  recoveryTokens: RecoveryTokens | null;
  completePasswordRecovery: () => void;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
  recoveryTokens: null,
  completePasswordRecovery: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryTokens, setRecoveryTokens] = useState<RecoveryTokens | null>(null);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (!error) setProfile(data);
  }, []);

  // useEffect(() => {
  //   supabase.auth.getSession().then(async ({ data: { session } }) => {
  //     setSession(session);
  //     if (session?.user) await fetchProfile(session.user.id);
  //     setLoading(false);
  //   });

  //   const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
  //     setSession(session);
  //     if (session?.user) await fetchProfile(session.user.id);
  //     else setProfile(null);
  //   });

  //   return () => listener.subscription.unsubscribe();
  // }, [fetchProfile]);

  useEffect(() => {
    let mounted = true;

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      setSession(session);
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [fetchProfile]);

  // Runs independently of the onAuthStateChange subscription above — this is
  // about catching the recovery deep link, not session state, so it doesn't
  // touch that listener at all.
  useEffect(() => {
    let mounted = true;
    Linking.getInitialURL().then((url) => {
      if (!mounted) return;
      const tokens = parseRecoveryTokens(url);
      if (tokens) setRecoveryTokens(tokens);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      const tokens = parseRecoveryTokens(url);
      if (tokens) setRecoveryTokens(tokens);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await fetchProfile(session.user.id);
  }, [session, fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const completePasswordRecovery = useCallback(() => {
    setRecoveryTokens(null);
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile, signOut, recoveryTokens, completePasswordRecovery }}>
      {children}
    </AuthContext.Provider>
  );
}