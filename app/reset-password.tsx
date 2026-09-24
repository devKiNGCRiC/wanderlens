/**
 * Route: /reset-password, "Set a new password" screen reached from the
 * password-recovery email link.
 *
 * Purpose: finishes the forgot-password flow. When the user taps the link in
 * Supabase's recovery email, AuthProvider parses the access/refresh tokens out
 * of the deep link into `recoveryTokens`. app/_layout.tsx puts this screen in
 * its own `<Stack.Protected guard={inRecovery}>` block, which takes priority
 * over every other guard, so the user lands here even if already signed in.
 *
 * How it works:
 * - On mount, calls `supabase.auth.setSession(recoveryTokens)` to sign in with
 *   the one-time recovery tokens; until that resolves a spinner is shown.
 * - Submitting calls `supabase.auth.updateUser({ password })`, which changes
 *   the password of the now-signed-in user.
 * - Success, an expired link, or Cancel all end with
 *   `completePasswordRecovery()`, which clears `recoveryTokens`. That flips the
 *   guard in _layout, so the router moves the user to the app (or to login if
 *   Cancel signed them out). This screen never navigates by itself.
 *
 * Why: the recovery state is kept separate from `session` (see the comment on
 * `recoveryTokens` in context/AuthProvider.tsx) so that establishing a session
 * here doesn't look like a normal login and skip the password step.
 */
import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ScreenBackground } from '@/components/ScreenBackground';
import { PasswordInput } from '@/components/PasswordInput';

/**
 * Reset-password screen. Exchanges the recovery tokens for a session, then
 * lets the user enter and confirm a new password.
 */
export default function ResetPassword() {
  const { recoveryTokens, completePasswordRecovery } = useAuth();
  // `ready` is true once the recovery session is established; the form is
  // hidden behind a spinner until then. `saving` covers the update request.
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  // Sign in with the tokens from the recovery link. If Supabase rejects them
  // (expired or already used), explain and exit recovery mode on OK.
  useEffect(() => {
    if (!recoveryTokens) return;
    supabase.auth.setSession(recoveryTokens).then(({ error }) => {
      if (error) {
        Alert.alert('Link expired', 'This password reset link is no longer valid — request a new one.', [
          { text: 'OK', onPress: completePasswordRecovery },
        ]);
        return;
      }
      setReady(true);
    });
    // Runs once per recovery link — recoveryTokens only changes when a new
    // link is opened, and completePasswordRecovery is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recoveryTokens]);

  /**
   * Validates the two fields and saves the new password.
   * Side effects: network call to Supabase Auth, native alerts, and on
   * success `completePasswordRecovery()` (which triggers the guard redirect).
   */
  async function handleSubmit() {
    // Client-side checks first: minimum length, then both fields match.
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Passwords don't match", 'Make sure both fields are the same.');
      return;
    }
    // Update the password for the user signed in via the recovery session.
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      Alert.alert('Could not update password', error.message);
      return;
    }
    Alert.alert('Password updated', "You're signed in with your new password.", [
      { text: 'OK', onPress: completePasswordRecovery },
    ]);
  }

  /**
   * Abandons the reset: signs out of the recovery session, then (whether or
   * not sign-out succeeded) clears recovery mode so the guards send the user
   * back to the signed-out screens.
   */
  function handleCancel() {
    supabase.auth.signOut().finally(completePasswordRecovery);
  }

  return (
    <ScreenBackground>
      <View style={styles.container}>
        <Text style={styles.wordmark}>Wanderlens</Text>
        <Text style={styles.title}>Set a new password</Text>

        {/* Spinner until the recovery session is ready, then the form:
            two password fields, the submit button and a Cancel link. */}
        {!ready ? (
          <ActivityIndicator color={theme.color.gold} style={{ marginTop: 32 }} />
        ) : (
          <>
            <Text style={styles.label}>New password</Text>
            <PasswordInput placeholder="At least 6 characters" value={password} onChangeText={setPassword} />

            <Text style={styles.label}>Confirm password</Text>
            <PasswordInput placeholder="Re-enter your new password" value={confirmPassword} onChangeText={setConfirmPassword} />

            <Pressable style={styles.button} onPress={handleSubmit} disabled={saving}>
              {saving ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.buttonText}>Update password</Text>}
            </Pressable>

            <Pressable onPress={handleCancel} disabled={saving}>
              <Text style={styles.link}>Cancel</Text>
            </Pressable>
          </>
        )}
      </View>
    </ScreenBackground>
  );
}

// Styles use font, colour and radius tokens from constants/theme.ts.
const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 28 },
  wordmark: { fontFamily: theme.font.display, fontSize: 22, color: theme.color.gold, textAlign: 'center', marginBottom: 6 },
  title: { fontFamily: theme.font.displayItalic, fontSize: 24, color: theme.color.cream, textAlign: 'center', marginBottom: 32 },
  label: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, marginBottom: 8, marginTop: 16 },
  button: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
  buttonText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
  link: { marginTop: 20, textAlign: 'center', color: theme.color.muted, fontFamily: theme.font.bodyRegular, fontSize: 13 },
});
