/**
 * Route: /about, the "About Wanderlens" screen.
 *
 * Purpose: a static page stating what the app is (the community-first thesis
 * from CLAUDE.md) and which version is installed. Registered as a modal in
 * app/_layout.tsx inside the signed-in-and-onboarded `<Stack.Protected>` block.
 *
 * How it works:
 * - No data fetching; everything shown is static text.
 * - The version string comes from `expo-constants`, which exposes the app
 *   config (app.json / app.config.js) at runtime, falling back to '1.0.0'.
 * - Hides the native stack header and draws its own top bar so it matches the
 *   rest of the app's custom headers; `useSafeAreaInsets` pushes that bar
 *   below the status bar / notch instead of hardcoding padding.
 */
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { ScreenBackground } from '@/components/ScreenBackground';

/**
 * About screen component. Renders the wordmark, tagline, a short description
 * and the app version. The back button pops this modal via `router.back()`.
 */
export default function About() {
  const router = useRouter();
  // Device safe-area insets, used to offset the custom top bar.
  const insets = useSafeAreaInsets();
  // Version from the Expo app config; the fallback covers a missing config.
  const version = Constants.expoConfig?.version ?? '1.0.0';

  // ScreenBackground is the shared constellation/contour backdrop used app-wide.
  // `<Stack.Screen options>` here overrides the header options set in _layout.
  return (
    <ScreenBackground>
      <Stack.Screen options={{ headerShown: false }} />
      {/* Custom top bar: back button, title, and an empty 44pt spacer that
          balances the back button so the title stays centred. */}
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={20} color={theme.color.cream} />
        </Pressable>
        <Text style={styles.topBarTitle}>About</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Body: wordmark, tagline, thesis paragraph and version number. */}
      <View style={styles.container}>
        <Text style={styles.wordmark}>Wanderlens</Text>
        <Text style={styles.tagline}>Golden hour, blue hour — a field journal for travelers and photographers.</Text>
        <Text style={styles.body}>
          Wanderlens is a crowdsourced, geo-tagged photo-spot map paired with a connection
          layer for meeting travelers and photographers by shared destination, dates, or
          genre. Community and connection are the product — AI is a supporting feature, not
          the centerpiece.
        </Text>
        <Text style={styles.version}>Version {version}</Text>
      </View>
    </ScreenBackground>
  );
}

// Styles pull fonts and colours from theme tokens in constants/theme.ts.
const styles = StyleSheet.create({
  // Top bar
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { fontFamily: theme.font.display, fontSize: 17, color: theme.color.cream },
  // Body content
  container: { padding: 24, alignItems: 'center', marginTop: 40 },
  wordmark: { fontFamily: theme.font.display, fontSize: 30, color: theme.color.gold },
  tagline: { fontFamily: theme.font.displayItalic, fontSize: 15, color: theme.color.cream, textAlign: 'center', marginTop: 12 },
  body: { fontFamily: theme.font.bodyRegular, fontSize: 14, color: theme.color.muted, textAlign: 'center', lineHeight: 21, marginTop: 20 },
  version: { fontFamily: theme.font.mono, fontSize: 12, color: theme.color.muted, marginTop: 32 },
});
