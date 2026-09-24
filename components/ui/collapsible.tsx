/**
 * Collapsible, a tap-to-expand section with a rotating chevron.
 *
 * Purpose: a leftover from the `create-expo-app` starter template's
 * "Explore" tab. Nothing in the repo imports it today.
 *
 * How it works:
 * - Local `isOpen` state toggles whether `children` render under the title.
 * - The chevron is an `IconSymbol` rotated 90 degrees when open.
 * - Built on the template's ThemedText / ThemedView.
 *
 * Gotchas: it imports `Colors` from constants/theme.ts, which only exports
 * `theme` now, so `npx tsc --noEmit` fails on this file. Because
 * `useColorScheme` is hardcoded to 'dark', the 'light' comparison below can
 * never be true (tsc flags that too). It also uses `TouchableOpacity`, where
 * new code in this repo uses `Pressable`.
 */
import { PropsWithChildren, useState } from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Expandable section.
 * @param title - heading text shown next to the chevron.
 * @param children - content revealed when open; starts collapsed.
 */
export function Collapsible({ children, title }: PropsWithChildren & { title: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const theme = useColorScheme() ?? 'light';

  // Tapping the heading row flips isOpen; content is only mounted while open.
  return (
    <ThemedView>
      <TouchableOpacity
        style={styles.heading}
        onPress={() => setIsOpen((value) => !value)}
        activeOpacity={0.8}>
        <IconSymbol
          name="chevron.right"
          size={18}
          weight="medium"
          color={theme === 'light' ? Colors.light.icon : Colors.dark.icon}
          style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}
        />

        <ThemedText type="defaultSemiBold">{title}</ThemedText>
      </TouchableOpacity>
      {isOpen && <ThemedView style={styles.content}>{children}</ThemedView>}
    </ThemedView>
  );
}

// Template spacing values, not constants/theme.ts tokens.
const styles = StyleSheet.create({
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  content: {
    marginTop: 6,
    marginLeft: 24,
  },
});
