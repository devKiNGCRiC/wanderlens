//_layout.tsx
/**
 * Root layout: the top of the expo-router tree, wrapping every route in the app.
 *
 * Purpose: this is the first component that renders. It initialises Sentry,
 * loads the custom fonts, stacks the app-wide context providers, and decides
 * which screens the user is allowed to reach based on their auth state. It is
 * the single place where auth gating lives (see CLAUDE.md, "Auth gating lives
 * in one place").
 *
 * How it works:
 * - `Sentry.init` runs once at module load, before any component renders.
 * - `RootLayout` nests the providers: AuthProvider (session + profile) on the
 *   outside, then ChatProvider and NotificationsProvider, which can call
 *   useAuth() because they sit inside it, then the React Navigation theme.
 * - `RootNavigator` loads fonts, reads auth state via useAuth(), shows
 *   <SplashLoading /> until both are ready, then renders the route Stack.
 * - The Stack is split into four `<Stack.Protected>` blocks. Each has a
 *   `guard` boolean; screens inside a block exist only while its guard is
 *   true. The guards are written so exactly one is true at any moment:
 *     1. Password recovery (recovery deep link in progress)
 *     2. Signed in and onboarded: the real app (tabs + modals)
 *     3. Signed in, not yet onboarded: the onboarding screen
 *     4. Signed out: the (auth) group (login / signup / forgot password)
 * - When auth state changes (login, sign out, onboarding finished), the
 *   guards re-evaluate and expo-router automatically redirects to the first
 *   screen the user is now allowed to see. Screens never navigate between
 *   these states by hand.
 *
 * Gotchas:
 * - A new screen must be registered inside the correct Protected block below,
 *   or it will not be gated the way you expect (see .claude/rules/architecture.md).
 * - Fonts must be registered in the useFonts call here, or text using them
 *   silently falls back to the system font.
 * - `import 'react-native-reanimated'` must stay at the top of this file
 *   (.claude/rules/react-native.md).
 */
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Sentry from '@sentry/react-native';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/context/AuthProvider';
import { ChatProvider } from '@/context/ChatProvider';
import { NotificationsProvider } from '@/context/NotificationsProvider';
import { SplashLoading } from '@/components/SplashLoading';

// Font families used across the app via theme.font in constants/theme.ts:
// Fraunces (display), Manrope (body), IBM Plex Mono (metadata).
import { useFonts, Fraunces_500Medium, Fraunces_500Medium_Italic } from '@expo-google-fonts/fraunces';
import { Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold } from '@expo-google-fonts/manrope';
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';

// The DSN is public/client-embeddable by design (unlike the Groq/Gemini keys)
// — it only identifies which Sentry project to report to. Still routed
// through EXPO_PUBLIC_* for consistency with how EXPO_PUBLIC_SUPABASE_URL is
// handled, and so it isn't hardcoded into source.
// `enabled: !__DEV__` means crash reporting only runs in release builds, so
// errors during local development don't reach the Sentry project.
Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !__DEV__,
  sendDefaultPii: true,
  tracesSampleRate: 1.0,
});

/**
 * expo-router setting: treats the (tabs) group as the anchor (initial route)
 * of this Stack, so a modal opened directly, e.g. from a deep link, still has
 * the tabs underneath it to go back to.
 */
export const unstable_settings = {
  anchor: '(tabs)',
};

/**
 * Renders the root Stack navigator and applies the auth guards.
 *
 * Kept separate from RootLayout because it calls useAuth(), which only works
 * inside <AuthProvider>; RootLayout is the component that renders that provider.
 */
function RootNavigator() {
  // Load every custom font weight the app uses. `fontsLoaded` stays false
  // until they are all ready.
  const [fontsLoaded] = useFonts({
    Fraunces_500Medium, Fraunces_500Medium_Italic,
    Manrope_400Regular, Manrope_500Medium, Manrope_600SemiBold,
    IBMPlexMono_400Regular, IBMPlexMono_500Medium,
  });
  // Auth state from context/AuthProvider.tsx. `loading` is true until the
  // first onAuthStateChange event has resolved the session (and profile).
  // `recoveryTokens` is set when the app was opened from a password-reset link.
  const { session, profile, loading, recoveryTokens } = useAuth();

  // Hold on the splash screen until fonts and auth are both resolved.
  // Rendering the Stack earlier would evaluate the guards with a
  // not-yet-known session and briefly flash the wrong screen (e.g. login).
  if (!fontsLoaded) return <SplashLoading />;
  if (loading) return <SplashLoading />;

  // Derived flags the guards below are built from. `!!` turns a possibly
  // null/undefined value into a strict boolean. A signed-in user whose
  // profile hasn't loaded counts as not onboarded.
  const isOnboarded = !!profile?.onboarded;
  const inRecovery = !!recoveryTokens;

  // Stack.Protected (expo-router): screens inside it are only reachable while
  // `guard` is true; when the guard flips to false the user is redirected
  // out. The four guards below are mutually exclusive:
  //   inRecovery                          -> reset-password
  //   !inRecovery && session && onboarded -> the app
  //   !inRecovery && session && !onboarded-> onboarding
  //   !inRecovery && !session             -> (auth)
  return (
    <Stack>
      {/* Highest priority and mutually exclusive with the three below — a
          recovery-link tap must always land here, regardless of whether the
          user happens to already have a normal session. */}
      <Stack.Protected guard={inRecovery}>
        <Stack.Screen name="reset-password" options={{ headerShown: false }} />
      </Stack.Protected>
      {/* Guard 2: signed in and onboarding completed. This is the main app:
          the bottom tabs plus every modal screen opened from them. Modal
          routes use presentation: 'modal' so they slide up over the tabs. */}
      <Stack.Protected guard={!inRecovery && !!session && isOnboarded}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        <Stack.Screen name="add-spot" options={{ presentation: 'modal', title: 'Add a spot' }} />
        <Stack.Screen name="pick-location" options={{ presentation: 'modal', title: 'Pick location' }} />
        <Stack.Screen name="spot-camera" options={{ presentation: 'fullScreenModal', title: 'Camera' }} />
        <Stack.Screen name="my-trails" options={{ presentation: 'modal', title: 'My trails' }} />
        <Stack.Screen name="notes" options={{ presentation: 'modal', title: 'Notes' }} />
        <Stack.Screen name="note-editor" options={{ presentation: 'modal', title: 'Note' }} />
        <Stack.Screen name="edit-profile" options={{ presentation: 'modal', title: 'Edit profile' }} />
        <Stack.Screen name="about" options={{ presentation: 'modal', title: 'About' }} />
        <Stack.Screen name="photo-studio" options={{ presentation: 'modal', title: 'Photo Styles' }} />
        <Stack.Screen name="trail-generator" options={{ presentation: 'modal', title: 'AI Trail' }} />
        <Stack.Screen name="new-message" options={{ presentation: 'modal', title: 'New message' }} />
        <Stack.Screen name="create-group" options={{ presentation: 'modal', title: 'New group' }} />
        {/* Full-screen pushed routes. They hide their own header from inside
            the screen; they're listed here only so this guard covers them.
            expo-router makes any route NOT listed in a Protected block
            reachable regardless of auth state, and leaves it in history
            after sign-out. */}
        <Stack.Screen name="spot/[id]" />
        <Stack.Screen name="user/[id]" />
        <Stack.Screen name="chat/[id]" />
        <Stack.Screen name="chat/archived" />
        <Stack.Screen name="group/[id]" />
        <Stack.Screen name="saved" />
        <Stack.Screen name="notifications" />
      </Stack.Protected>
      {/* Guard 3: signed in but the profile's onboarded flag is still false.
          Only the onboarding flow is reachable. Once it sets onboarded and
          the profile refreshes, guard 2 takes over and the tabs appear. */}
      <Stack.Protected guard={!inRecovery && !!session && !isOnboarded}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
      {/* Guard 4: signed out. Only the (auth) group (login, signup, forgot
          password) is reachable. Signing in sets `session`, which switches
          to guard 2 or 3 automatically. */}
      <Stack.Protected guard={!inRecovery && !session}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

/**
 * The root layout component expo-router renders for the whole app.
 *
 * Provider order matters: ChatProvider and NotificationsProvider sit inside
 * AuthProvider so they can read the current user. The navigation theme
 * follows useColorScheme(), which is hardcoded to 'dark' in this project, so
 * DarkTheme is always the one applied (single dark theme by design).
 */
function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <AuthProvider>
      <ChatProvider>
        <NotificationsProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <RootNavigator />
            <StatusBar style="auto" />
          </ThemeProvider>
        </NotificationsProvider>
      </ChatProvider>
    </AuthProvider>
  );
}

// Sentry.wrap adds Sentry's error boundary and performance instrumentation
// around the whole app before handing it to expo-router as the default export.
export default Sentry.wrap(RootLayout);