import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { ScreenBackground } from '@/components/ScreenBackground';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (!email) {
      Alert.alert('Missing info', 'Enter the email address on your account.');
      return;
    }
    setLoading(true);
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
        <Text style={styles.wordmark}>Wanderlens</Text>
        <Text style={styles.title}>Reset your password</Text>

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

        <Pressable onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Text style={styles.link}>Back to log in</Text>
        </Pressable>
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
  body: { fontFamily: theme.font.bodyRegular, fontSize: 14, color: theme.color.cream, textAlign: 'center', lineHeight: 21 },
  link: { textAlign: 'center', color: theme.color.gold, fontFamily: theme.font.bodyRegular, fontSize: 13 },
});
