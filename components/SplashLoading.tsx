import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';
import { ScreenBackground } from '@/components/ScreenBackground';

// Shown while fonts/auth resolve, before the app is ready — this must not
// assume the custom fonts have loaded yet (they might not have), so it
// deliberately uses the system font rather than Fraunces/Manrope.
export function SplashLoading() {
  return (
    <ScreenBackground>
      <View style={styles.container}>
        <Text style={styles.wordmark}>Wanderlens</Text>
        <Text style={styles.tagline}>golden hour, blue hour</Text>
        <ActivityIndicator size="small" color={theme.color.gold} style={styles.spinner} />
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontSize: 30, fontWeight: '600', color: theme.color.gold, letterSpacing: 1 },
  tagline: { fontSize: 12, color: theme.color.muted, letterSpacing: 2, marginTop: 6, textTransform: 'uppercase' },
  spinner: { marginTop: 28 },
});
