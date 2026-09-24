/**
 * AuthProvider: the app-wide source of truth for "who is signed in".
 *
 * Purpose: holds the Supabase session, the signed-in user's `profiles` row,
 * and password-recovery state, and exposes them through `useAuth()`. It wraps
 * the whole app in app/_layout.tsx, whose `<Stack.Protected>` guards read
 * `session`, `profile.onboarded`, `loading`, and `recoveryTokens` to decide
 * which group of screens is reachable (recovery, signed out, onboarding, or
 * the main app). ChatProvider and NotificationsProvider sit inside it and read
 * `session` from here.
 *
 * How it works:
 * - Subscribes to `supabase.auth.onAuthStateChange`, which fires once on
 *   startup with the stored session (or null) and again on every sign-in,
 *   sign-out, and token refresh.
 * - On each event it loads the user's profile row from the `profiles` table
 *   and only then flips `loading` to false, so the guards never see a session
 *   without its profile.
 * - Separately listens for the password-reset deep link (expo-linking) and
 *   parses its tokens into `recoveryTokens`.
 * - Screens call `refreshProfile()` after they change the profile (onboarding,
 *   edit-profile) so the guards and UI see the new values.
 *
 * Why only onAuthStateChange: a parallel `getSession()` call raced with the
 * listener in an earlier version (see the commented-out block below and
 * .claude/rules/supabase.md). This file must stay the only place that reads
 * session state from `supabase.auth`.
 */
//AuthProvider.tsx
import { createContext, useContext, useEffect, useState, useCallback, type PropsWithChildren } from 'react';
import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

/** The access/refresh token pair carried by a Supabase password-recovery link. */
type RecoveryTokens = { access_token: string; refresh_token: string };

// Supabase's recovery email link puts the tokens in the URL fragment
// (`wanderlens://reset-password#access_token=...&refresh_token=...&type=recovery`)
// — a web-oriented format (mirrors `window.location.hash`) that Supabase sends
// regardless of platform. `detectSessionInUrl: false` in lib/supabase.js means
// the client never parses this automatically (there's no browser location to
// read on native), so this app has to do it by hand.
/**
 * Extracts recovery tokens from a deep-link URL.
 * @param url The URL the app was opened with (may be null when launched normally).
 * @returns The token pair, or null if this isn't a complete recovery link.
 */
function parseRecoveryTokens(url: string | null): RecoveryTokens | null {
  // Guard: no URL, or no `#fragment`, means this can't be a recovery link.
  if (!url) return null;
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return null;
  // The fragment has query-string syntax, so URLSearchParams can parse it.
  const params = new URLSearchParams(url.slice(hashIndex + 1));
  // Other auth links (e.g. signup confirmation) use a different `type`; ignore them.
  if (params.get('type') !== 'recovery') return null;
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  // Both tokens are needed for supabase.auth.setSession() in reset-password.tsx.
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

/**
 * One row of the `profiles` table (loaded with `select('*')`). The row is
 * auto-created by the `handle_new_user` trigger on signup, and filled in by
 * onboarding. `onboarded` decides which auth guard the user lands in.
 */
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
  trip_destinations: string[] | null;
  trip_start_date: string | null;
  trip_end_date: string | null;
};

/** Everything `useAuth()` returns. */
type AuthContextType = {
  session: Session | null;
  profile: Profile | null;
  // True until the first auth event (and its profile fetch) has finished.
  loading: boolean;
  // Re-reads the profile row after a screen has updated it.
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
  // Non-null exactly while the user is mid password-reset (arrived via the
  // recovery email link). Deliberately independent of `session` — see the
  // guard in app/_layout.tsx: establishing a session to call
  // auth.updateUser() would otherwise look identical to a normal login and
  // get routed straight into the app before the user sets a new password.
  recoveryTokens: RecoveryTokens | null;
  // Clears `recoveryTokens` once reset-password.tsx is done, releasing the recovery guard.
  completePasswordRecovery: () => void;
};

// Default values are only used if a component calls useAuth() outside the
// provider; `loading: true` keeps such a component in its loading state.
const AuthContext = createContext<AuthContextType>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
  signOut: async () => {},
  recoveryTokens: null,
  completePasswordRecovery: () => {},
});

/**
 * Hook for reading auth state anywhere in the app.
 * @returns The session, profile, loading flag, recovery state, and auth actions.
 */
export function useAuth() {
  return useContext(AuthContext);
}

/**
 * Provider component rendered once at the root in app/_layout.tsx.
 * Owns the session/profile state and the auth + deep-link subscriptions.
 */
export function AuthProvider({ children }: PropsWithChildren) {
  // Auth state shared with the whole app through the context value below.
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryTokens, setRecoveryTokens] = useState<RecoveryTokens | null>(null);

  // Loads the signed-in user's profile row. `.single()` expects exactly one
  // row; on any error the previous profile value is left as it was.
  // Wrapped in useCallback so its identity is stable for the effects below.
  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (!error) setProfile(data);
  }, []);

  // Kept on purpose: this is the earlier version that called getSession() AND
  // subscribed to onAuthStateChange. The two raced each other (both set the
  // session and fetched the profile). It stays here as a reminder not to
  // re-add a parallel getSession() call; see .claude/rules/supabase.md.
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

  // The single auth subscription. onAuthStateChange also fires an initial
  // event with the session restored from AsyncStorage, so no separate
  // getSession() is needed. `loading` is cleared only after the profile fetch,
  // so app/_layout.tsx's guards decide on complete data.
  useEffect(() => {
    // Prevents state updates after the provider unmounts.
    let mounted = true;

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      setSession(session);
      // Signed in: load the profile. Signed out: clear the stale profile.
      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    // Cleanup: stop listening when the provider unmounts.
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
    // Cold start: the app was launched by tapping the recovery link.
    Linking.getInitialURL().then((url) => {
      if (!mounted) return;
      const tokens = parseRecoveryTokens(url);
      if (tokens) setRecoveryTokens(tokens);
    });
    // Warm start: the link was tapped while the app was already running.
    const sub = Linking.addEventListener('url', ({ url }) => {
      const tokens = parseRecoveryTokens(url);
      if (tokens) setRecoveryTokens(tokens);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // Called by onboarding.tsx and edit-profile.tsx after they write to `profiles`.
  const refreshProfile = useCallback(async () => {
    if (session?.user) await fetchProfile(session.user.id);
  }, [session, fetchProfile]);

  // Signing out triggers onAuthStateChange above, which clears session and profile.
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // Ends recovery mode; the normal session-based guards take over again.
  const completePasswordRecovery = useCallback(() => {
    setRecoveryTokens(null);
  }, []);

  // Expose state and actions to every descendant via useAuth().
  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile, signOut, recoveryTokens, completePasswordRecovery }}>
      {children}
    </AuthContext.Provider>
  );
}