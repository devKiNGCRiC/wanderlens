import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { useAuth } from '@/context/AuthProvider';
import { ScreenBackground } from '@/components/ScreenBackground';

export default function ResetPassword() {
  const { recoveryTokens, completePasswordRecovery } = useAuth();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

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

  async function handleSubmit() {
    if (password.length < 6) {
      Alert.alert('Password too short', 'Use at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Passwords don't match", 'Make sure both fields are the same.');
      return;
    }
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

  function handleCancel() {
    supabase.auth.signOut().finally(completePasswordRecovery);
  }

  return (
    <ScreenBackground>
      <View style={styles.container}>
        <Text style={styles.wordmark}>Wanderlens</Text>
        <Text style={styles.title}>Set a new password</Text>

        {!ready ? (
          <ActivityIndicator color={theme.color.gold} style={{ marginTop: 32 }} />
        ) : (
          <>
            <Text style={styles.label}>New password</Text>
            <TextInput style={styles.input} placeholder="At least 6 characters" placeholderTextColor={theme.color.muted} value={password} onChangeText={setPassword} secureTextEntry />

            <Text style={styles.label}>Confirm password</Text>
            <TextInput style={styles.input} placeholder="Re-enter your new password" placeholderTextColor={theme.color.muted} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />

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

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 28 },
  wordmark: { fontFamily: theme.font.display, fontSize: 22, color: theme.color.gold, textAlign: 'center', marginBottom: 6 },
  title: { fontFamily: theme.font.displayItalic, fontSize: 24, color: theme.color.cream, textAlign: 'center', marginBottom: 32 },
  label: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 14, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15, borderWidth: 1, borderColor: theme.color.surface2 },
  button: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
  buttonText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
  link: { marginTop: 20, textAlign: 'center', color: theme.color.muted, fontFamily: theme.font.bodyRegular, fontSize: 13 },
});
