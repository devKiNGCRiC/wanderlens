/**
 * Route: /forgot-password, request a password-reset email.
 *
 * Purpose: step one of password recovery. Sits in the (auth) group under
 * guard 4 of app/_layout.tsx and is opened from the login screen.
 *
 * How it works:
 * - Calls supabase.auth.resetPasswordForEmail with a redirect URL built by
 *   expo-linking that points back into this app at /reset-password.
 * - Tapping the emailed link opens the app; AuthProvider parses the recovery
 *   tokens from that URL, which turns on the recovery guard in
 *   app/_layout.tsx and shows app/reset-password.tsx.
 * - After sending, the form is swapped for a neutral confirmation message.
 */
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { ScreenBackground } from '@/components/ScreenBackground';

/** Forgot-password screen component (default export = the route). */
export default function ForgotPassword() {
  const router = useRouter();
  // Email input, submit spinner flag, and `sent`, which switches the screen
  // from the form to the confirmation message.
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  /**
   * Asks Supabase to email a reset link, then shows the confirmation state.
   * Side effects: network call; errors are logged, not shown (see below).
   */
  async function handleSend() {
    if (!email) {
      Alert.alert('Missing info', 'Enter the email address on your account.');
      return;
    }
    setLoading(true);
    // Linking.createURL builds a deep link into this app (using the app's
    // URL scheme) for the reset-password route; Supabase puts it in the email.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: Linking.createURL('reset-password'),
    });
    setLoading(false);
    // Don't reveal whether the email exists — show the same confirmation
    // either way, matching how most auth providers handle this.
    if (error) console.error('resetPasswordForEmail failed:', error.message);
    setSent(true);
  }

  return (
    <ScreenBackground>
      <View style={styles.container}>
        {/* Brand header */}
        <Text style={styles.wordmark}>Wanderlens</Text>
        <Text style={styles.title}>Reset your password</Text>

        {/* After sending: confirmation text. Before: the email form. */}
        {sent ? (
          <Text style={styles.body}>
            If there&apos;s an account for {email}, we&apos;ve sent a link to reset your password. Check your inbox.
          </Text>
        ) : (
          <>
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor={theme.color.muted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />

            <Pressable style={styles.button} onPress={handleSend} disabled={loading}>
              {loading ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.buttonText}>Send reset link</Text>}
            </Pressable>
          </>
        )}

        {/* Back to the login screen that opened this one */}
        <Pressable onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={styles.link}>Back to log in</Text>
        </Pressable>
      </View>
    </ScreenBackground>
  );
}

// Styles use design tokens (colors, fonts, radii) from constants/theme.ts.
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 28 },
  wordmark: { fontFamily: theme.font.display, fontSize: 22, color: theme.color.gold, textAlign: 'center', marginBottom: 6 },
  title: { fontFamily: theme.font.displayItalic, fontSize: 24, color: theme.color.cream, textAlign: 'center', marginBottom: 32 },
  // Form fields and button
  label: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 14, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15, borderWidth: 1, borderColor: theme.color.surface2 },
  button: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
  buttonText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
  // Confirmation text and back link
  body: { fontFamily: theme.font.bodyRegular, fontSize: 14, color: theme.color.cream, textAlign: 'center', lineHeight: 21 },
  link: { textAlign: 'center', color: theme.color.gold, fontFamily: theme.font.bodyRegular, fontSize: 13 },
});
