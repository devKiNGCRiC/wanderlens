/**
 * ThemedText, the starter template's color-scheme-aware `<Text>`.
 *
 * Purpose: a leftover from the `create-expo-app` starter template (kebab-case
 * name). Still imported by app/modal.tsx (itself a template leftover) and by
 * components/ui/collapsible.tsx; the real Wanderlens screens style text with
 * `theme` tokens from constants/theme.ts instead.
 *
 * How it works:
 * - Picks a text color via `useThemeColor`, preferring the `lightColor` /
 *   `darkColor` prop for the active scheme, else the template palette.
 * - `type` selects one of five preset text styles defined below.
 *
 * Gotchas: `useThemeColor` imports `Colors` from constants/theme.ts, which
 * only exports `theme` now, so the fallback lookup has no palette to read
 * (`npx tsc --noEmit` reports it). The app is dark-only, so only `darkColor`
 * would ever apply.
 */
import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/use-theme-color';

/** Normal Text props plus per-scheme color overrides and a preset style name. */
export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

/**
 * Text that applies the scheme color, then the preset for `type`, then any
 * caller `style` last (so the caller always wins).
 */
export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

// Template presets: raw sizes and a hex link color, not constants/theme.ts
// tokens (the app's own components use tokens).
const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
    color: '#0a7ea4',
  },
});
