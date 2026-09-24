/**
 * SplashLoading, the full-screen "app is starting" view.
 *
 * Purpose: app/_layout.tsx renders this instead of the route Stack while
 * the custom fonts are still loading, and again while AuthProvider is still
 * resolving the session (`loading`). Only after both are done does the
 * app pick which `<Stack.Protected>` group of screens to show.
 *
 * How it works: the shared ScreenBackground with a gold "Wanderlens"
 * wordmark, a tagline and a small gold spinner. No props, no state.
 */
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

// Colors come from theme tokens in constants/theme.ts. No `fontFamily` is
// set anywhere here, on purpose (see the comment above the component).
const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  wordmark: { fontSize: 30, fontWeight: '600', color: theme.color.gold, letterSpacing: 1 },
  tagline: { fontSize: 12, color: theme.color.muted, letterSpacing: 2, marginTop: 6, textTransform: 'uppercase' },
  spinner: { marginTop: 28 },
});
