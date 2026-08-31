import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { ScreenBackground } from '@/components/ScreenBackground';
import { KeyboardAwareScrollView } from '@codler/react-native-keyboard-aware-scroll-view';

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken';

export default function SignUp() {
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const clean = username.trim().toLowerCase();
    if (clean.length < 3) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    const timeout = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id').eq('username', clean).maybeSingle();
      setUsernameStatus(data ? 'taken' : 'available');
    }, 500);
    return () => clearTimeout(timeout);
  }, [username]);

  async function handleSignUp() {
    if (!email || !password || !fullName || !username) {
      Alert.alert('Missing info', 'Please fill in all fields.');
      return;
    }
    if (usernameStatus === 'taken') {
      Alert.alert('Username taken', 'Please choose a different username.');
      return;
    }
    setLoading(true);
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
        <Text style={styles.wordmark}>Wanderlens</Text>
        <Text style={styles.title}>Create your account</Text>

        <Text style={styles.label}>Full name</Text>
        <TextInput style={styles.input} placeholder="Your name" placeholderTextColor={theme.color.muted} value={fullName} onChangeText={setFullName} autoCapitalize="words" />

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
        <TextInput style={styles.input} placeholder="At least 6 characters" placeholderTextColor={theme.color.muted} value={password} onChangeText={setPassword} secureTextEntry />

        <Pressable style={styles.button} onPress={handleSignUp} disabled={loading}>
          {loading ? <ActivityIndicator color={theme.color.dusk} /> : <Text style={styles.buttonText}>Create account</Text>}
        </Pressable>

        <Link href="/(auth)/login" style={styles.link}>Already have an account? Log in</Link>
      </KeyboardAwareScrollView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 28, paddingTop: 80, paddingBottom: 40 },
  wordmark: { fontFamily: theme.font.display, fontSize: 22, color: theme.color.gold, textAlign: 'center', marginBottom: 6 },
  title: { fontFamily: theme.font.displayItalic, fontSize: 24, color: theme.color.cream, textAlign: 'center', marginBottom: 32 },
  label: { fontFamily: theme.font.body, fontSize: 13, color: theme.color.muted, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, padding: 14, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15, borderWidth: 1, borderColor: theme.color.surface2 },
  usernameRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.color.surface, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: theme.color.surface2, paddingHorizontal: 14 },
  atSign: { fontFamily: theme.font.mono, fontSize: 15, color: theme.color.muted },
  usernameInput: { flex: 1, paddingVertical: 14, paddingHorizontal: 4, color: theme.color.cream, fontFamily: theme.font.bodyRegular, fontSize: 15 },
  available: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.gold },
  taken: { fontFamily: theme.font.mono, fontSize: 11, color: theme.color.ember },
  button: { backgroundColor: theme.color.gold, borderRadius: theme.radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 28 },
  buttonText: { color: theme.color.dusk, fontFamily: theme.font.body, fontSize: 15 },
  link: { marginTop: 20, textAlign: 'center', color: theme.color.gold, fontFamily: theme.font.bodyRegular, fontSize: 13 },
});