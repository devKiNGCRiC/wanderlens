/**
 * Route: /login, the email + password sign-in screen.
 *
 * Purpose: the default landing screen for signed-out users. It sits in the
 * (auth) group under guard 4 of app/_layout.tsx.
 *
 * How it works:
 * - Keeps the email, password and a loading flag in local state.
 * - Calls supabase.auth.signInWithPassword. On success it does NOT navigate:
 *   AuthProvider's onAuthStateChange listener picks up the new session, the
 *   guards in app/_layout.tsx re-evaluate, and expo-router moves the user to
 *   onboarding or the tabs automatically.
 * - On failure it shows the Supabase error in an Alert.
 * - Links out to the forgot-password and signup screens.
 */
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { ScreenBackground } from '@/components/ScreenBackground';
import { PasswordInput } from '@/components/PasswordInput';

/** Login screen component (default export = the route). */
export default function Login() {
  // Form fields, plus `loading` to disable the button and show a spinner
  // while the sign-in request is in flight.
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * Validates the form and signs in with Supabase Auth.
   * Side effects: network call, Alert on missing input or error. Navigation
   * happens indirectly through the auth guards, not here.
   */
  async function handleLogin() {
    // Guard: both fields are required before hitting the network.
    if (!email || !password) {
      Alert.alert('Missing info', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) Alert.alert('Login failed', error.message);
  }

  return (
    <ScreenBackground>
      <View style={styles.container}>
        {/* Brand header */}
        <Text style={styles.wordmark}>Wanderlens</Text>
        <Text style={styles.title}>Welcome back</Text>

        {/* Credentials. PasswordInput is the shared field with a show/hide toggle. */}
        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor={theme.color.muted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />

        <Text style={styles.label}>Password</Text>
        <PasswordInput placeholder="Your password" value={password} onChangeText={setPassword} />

        {/* Submit: disabled while loading to prevent double submits. */}
        <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.buttonText}>Log in</Text>}
        </Pressable>

        {/* Links to the other screens in the (auth) group */}
        <Link href="/(auth)/forgot-password" style={styles.link}>Forgot password?</Link>
        <Link href="/(auth)/signup" style={styles.link}>Don&apos;t have an account? Sign up</Link>
      </View>
    </ScreenBackground>
  );
}

// Styles use design tokens (colors, fonts, radii) from constants/theme.ts.
// The same auth-form styles are repeated in signup.tsx and forgot-password.tsx.
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 28 },
  wordmark: { fontFamily: theme.font.display, fontSize: 22, color: theme.color.gold, textAlign: 'center', marginBottom: 6 },
  title: { fontFamily: theme.font.displayItalic, fontSize: 24, color: theme.color.cream, textAlign: 'center', marginBottom: 32 },
  // Form fields
  label: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 14, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15, borderWidth: 1, borderColor: theme.color.surface2 },
  // Primary button and links
  button: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
  buttonText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
  link: { marginTop: 20, textAlign: 'center', color: theme.color.gold, fontFamily: theme.font.bodyRegular, fontSize: 13 },
});