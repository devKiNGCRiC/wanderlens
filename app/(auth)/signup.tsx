/**
 * Route: /signup, the create-account screen.
 *
 * Purpose: lets a new user register with full name, username, email and
 * password. Sits in the (auth) group under guard 4 of app/_layout.tsx and is
 * reached from the "Sign up" link on the login screen.
 *
 * How it works:
 * - Checks username availability live as the user types: after a 500 ms
 *   pause it queries the `profiles` table for a matching username.
 * - Calls supabase.auth.signUp, passing full_name and username as user
 *   metadata. The `handle_new_user` database trigger uses that metadata to
 *   create the user's `profiles` row (see .claude/rules/supabase.md).
 * - On success it asks the user to confirm their email; it does not navigate.
 *   Once a session exists, the guards in app/_layout.tsx route the user to
 *   onboarding.
 *
 * Why: the form is inside KeyboardAwareScrollView so fields near the bottom
 * scroll above the on-screen keyboard instead of being hidden by it.
 *
 * Gotchas: the live username check is a UX hint only. Two people can still
 * race for the same name; uniqueness has to be enforced by the database.
 */
import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { ScreenBackground } from '@/components/ScreenBackground';
import { PasswordInput } from '@/components/PasswordInput';
import { KeyboardAwareScrollView } from '@codler/react-native-keyboard-aware-scroll-view';

/**
 * State of the live username availability check:
 * idle (too short to check), checking (request pending), available, taken.
 */
type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken';

/** Sign-up screen component (default export = the route). */
export default function SignUp() {
  // Form fields, the username check result, and the submit spinner flag.
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // Debounced username availability check. Runs every time `username`
  // changes, but only queries Supabase after the user stops typing for
  // 500 ms, so each keystroke doesn't fire a request.
  useEffect(() => {
    // Usernames are stored lower-cased and trimmed, so compare the same form.
    const clean = username.trim().toLowerCase();
    // Too short to be worth checking: reset the indicator and stop.
    if (clean.length < 3) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    // Set to true by the cleanup below when the user types again, so a slow
    // response for an older value can't overwrite the newer result.
    let cancelled = false;

    const timeout = setTimeout(async () => {
      // maybeSingle(): zero rows is a normal outcome here (name is free), so
      // it returns null instead of throwing like .single() would.
      const { data } = await supabase.from('profiles').select('id').eq('username', clean).maybeSingle();
      if (!cancelled) {
        setUsernameStatus(data ? 'taken' : 'available');
      }
    }, 500);

    // Cleanup runs before the next effect (next keystroke) or on unmount:
    // cancel the pending timer and ignore any in-flight response.
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [username]);

  /**
   * Validates the form and registers the user with Supabase Auth.
   * Side effects: network call and an Alert for the result. The username is
   * trimmed and lower-cased to match the availability check above.
   */
  async function handleSignUp() {
    // Guard: every field is required.
    if (!email || !password || !fullName || !username) {
      Alert.alert('Missing info', 'Please fill in all fields.');
      return;
    }
    // Guard: block a username the live check already found in use.
    if (usernameStatus === 'taken') {
      Alert.alert('Username taken', 'Please choose a different username.');
      return;
    }
    setLoading(true);
    // `options.data` becomes the auth user's metadata, which the
    // handle_new_user trigger reads when creating the profiles row.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName, username: username.trim().toLowerCase() } },
    });
    setLoading(false);
    if (error) Alert.alert('Sign up failed', error.message);
    else Alert.alert('Almost there', 'Check your email to confirm your account.');
  }

  return (
    <ScreenBackground>
      <KeyboardAwareScrollView contentContainerStyle={styles.container} enableOnAndroid extraScrollHeight={28} keyboardShouldPersistTaps="handled">
        {/* Brand header */}
        <Text style={styles.wordmark}>Wanderlens</Text>
        <Text style={styles.title}>Create your account</Text>

        <Text style={styles.label}>Full name</Text>
        <TextInput style={styles.input} placeholder="Your name" placeholderTextColor={theme.color.muted} value={fullName} onChangeText={setFullName} autoCapitalize="words" />

        {/* Username field with an "@" prefix and the live availability indicator on the right */}
        <Text style={styles.label}>Username</Text>
        <View style={styles.usernameRow}>
          <Text style={styles.atSign}>@</Text>
          <TextInput style={styles.usernameInput} placeholder="yourname" placeholderTextColor={theme.color.muted} value={username} onChangeText={setUsername} autoCapitalize="none" />
          {usernameStatus === 'checking' && <ActivityIndicator size="small" color={theme.color.muted} />}
          {usernameStatus === 'available' && <Text style={styles.available}>✓ available</Text>}
          {usernameStatus === 'taken' && <Text style={styles.taken}>taken</Text>}
        </View>

        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor={theme.color.muted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />

        <Text style={styles.label}>Password</Text>
        <PasswordInput placeholder="At least 6 characters" value={password} onChangeText={setPassword} />

        {/* Submit: disabled while loading to prevent double submits. */}
        <Pressable style={styles.button} onPress={handleSignUp} disabled={loading}>
          {loading ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.buttonText}>Create account</Text>}
        </Pressable>

        <Link href="/(auth)/login" style={styles.link}>Already have an account? Log in</Link>
      </KeyboardAwareScrollView>
    </ScreenBackground>
  );
}

// Styles use design tokens (colors, fonts, radii) from constants/theme.ts.
const styles = StyleSheet.create({
  // flexGrow (not flex) so the scroll view can still grow taller than the
  // screen when the keyboard is open.
  container: { flexGrow: 1, justifyContent: 'center', padding: 28, paddingTop: 80, paddingBottom: 40 },
  wordmark: { fontFamily: theme.font.display, fontSize: 22, color: theme.color.gold, textAlign: 'center', marginBottom: 6 },
  title: { fontFamily: theme.font.displayItalic, fontSize: 24, color: theme.color.cream, textAlign: 'center', marginBottom: 32 },
  // Form fields
  label: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 14, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15, borderWidth: 1, borderColor: theme.color.surface2 },
  // Username row: styled to look like `input`, with the status text inside it
  usernameRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.color.surface2, paddingHorizontal: 14 },
  atSign: { fontFamily: theme.font.mono, fontSize: 15, color: theme.color.muted },
  usernameInput: { flex: 1, paddingVertical: 14, paddingHorizontal: 4, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15 },
  available: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.gold },
  taken: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.ember },
  // Primary button and link
  button: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
  buttonText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
  link: { marginTop: 20, textAlign: 'center', color: theme.color.gold, fontFamily: theme.font.bodyRegular, fontSize: 13 },
});