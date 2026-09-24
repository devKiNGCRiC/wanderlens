/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

/**
 * useThemeColor: surviving Expo template hook (kebab-case file name).
 *
 * Purpose: resolves a color for the template components
 * components/themed-text.tsx, themed-view.tsx and parallax-scroll-view.tsx.
 * App-specific screens use tokens from constants/theme.ts directly instead.
 *
 * How it works: asks useColorScheme() for the scheme (always 'dark' in this
 * app), prefers a color passed in props for that scheme, and otherwise falls
 * back to the named entry in `Colors` from constants/theme.ts.
 */
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * @param props Optional per-scheme overrides, e.g. `{ dark: '#000' }`.
 * @param colorName A key that exists in both `Colors.light` and `Colors.dark`.
 * @returns The override for the current scheme if given, else the theme color.
 */
export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.light & keyof typeof Colors.dark
) {
  // The `?? 'light'` fallback is from the template; with the hardcoded hook it never applies.
  const theme = useColorScheme() ?? 'light';
  const colorFromProps = props[theme];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    return Colors[theme][colorName];
  }
}
