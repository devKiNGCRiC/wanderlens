import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { ScreenBackground } from '@/components/ScreenBackground';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
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
        <Text style={styles.wordmark}>Wanderlens</Text>
        <Text style={styles.title}>Welcome back</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput style={styles.input} placeholder="you@example.com" placeholderTextColor={theme.color.muted} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />

        <Text style={styles.label}>Password</Text>
        <TextInput style={styles.input} placeholder="Your password" placeholderTextColor={theme.color.muted} value={password} onChangeText={setPassword} secureTextEntry />

        <Pressable style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.buttonText}>Log in</Text>}
        </Pressable>

        <Link href="/(auth)/signup" style={styles.link}>Don't have an account? Sign up</Link>
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
  link: { marginTop: 20, textAlign: 'center', color: theme.color.gold, fontFamily: theme.font.bodyRegular, fontSize: 13 },
});