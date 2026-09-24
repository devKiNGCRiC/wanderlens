/**
 * ThemedView, the starter template's color-scheme-aware `<View>`.
 *
 * Purpose: a leftover from the `create-expo-app` starter template (kebab-case
 * name). Still imported by app/modal.tsx (a template leftover screen), plus
 * components/parallax-scroll-view.tsx and components/ui/collapsible.tsx.
 * Wanderlens screens use `ScreenBackground` instead.
 *
 * How it works: sets `backgroundColor` from `useThemeColor` (the per-scheme
 * prop if given, else the template palette), then applies the caller's style.
 *
 * Gotchas: `useThemeColor` imports a `Colors` export that constants/theme.ts
 * no longer has (`npx tsc --noEmit` reports it).
 */
import { View, type ViewProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

/** Normal View props plus optional per-scheme background overrides. */
export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
};

/** A View with a scheme-based background; caller `style` is applied after it. */
export function ThemedView({ style, lightColor, darkColor, ...otherProps }: ThemedViewProps) {
  const backgroundColor = useThemeColor({ light: lightColor, dark: darkColor }, 'background');

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
