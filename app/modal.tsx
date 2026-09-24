/**
 * Route: /modal, placeholder modal screen from the Expo starter template.
 *
 * Purpose: a leftover from the `create-expo-app` template. It is still
 * registered in app/_layout.tsx (inside the signed-in-and-onboarded
 * `<Stack.Protected>` block, with `presentation: 'modal'`), but no Wanderlens
 * screen is built on it; it just shows a title and a link home.
 *
 * How it works:
 * - Uses the template's `ThemedText` / `ThemedView` (kebab-case files in
 *   components/), not the app's own `theme` tokens like the real screens do.
 * - The `<Link href="/" dismissTo>` closes the modal and returns to the root
 *   route instead of pushing a new copy of the home screen on top.
 */
import { Link } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

/**
 * Template modal: a centred title plus a link that dismisses back to "/".
 * Rendered by expo-router when something navigates to /modal.
 */
export default function ModalScreen() {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">This is a modal</ThemedText>
      <Link href="/" dismissTo style={styles.link}>
        <ThemedText type="link">Go to home screen</ThemedText>
      </Link>
    </ThemedView>
  );
}

// Template styles: plain numbers rather than constants/theme.ts tokens,
// since this file predates the Wanderlens design system.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});
