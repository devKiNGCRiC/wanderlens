/**
 * lib/supabase.js: the single Supabase client used by the whole app.
 *
 * Purpose: every database query, RPC call, storage upload, Realtime channel,
 * Edge Function call, and auth action goes through the `supabase` object
 * exported here. Session state is read only in context/AuthProvider.tsx.
 *
 * How it works:
 * - URL and anon key come from EXPO_PUBLIC_* env vars, which are inlined into
 *   the app bundle at build time. They are public by design; Row Level
 *   Security (RLS, per-row access rules in Postgres) is what actually protects
 *   the data. See .claude/rules/security.md.
 * - The login session is persisted to AsyncStorage so users stay signed in
 *   across app restarts.
 * - Token auto-refresh runs only while the app is in the foreground.
 *
 * Gotcha: this file is plain JavaScript (the rest of the app is TypeScript),
 * so the client isn't typed against the database schema.
 */
import { AppState, Platform } from 'react-native';
// Adds a full URL implementation, which supabase-js relies on and React Native lacks.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Public project config, read from .env at build time.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Where the session is saved between launches.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Native apps have no browser URL to read a session from. The password
    // recovery link is parsed by hand in context/AuthProvider.tsx instead.
    detectSessionInUrl: false,
  },
});

// Keeps the auth session refreshing while the app is in the foreground
// Registered once at module load, for the lifetime of the app; never removed.
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});