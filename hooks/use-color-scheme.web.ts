/**
 * useColorScheme (web): the web-platform twin of hooks/use-color-scheme.ts.
 *
 * Metro resolves `@/hooks/use-color-scheme` to this file when bundling for web.
 * Like the native version, it deliberately always returns 'dark' (see CLAUDE.md,
 * "Single dark theme is the intended design").
 */
// Wanderlens is deliberately dark-mode only — see hooks/use-color-scheme.ts.
// A constant return also sidesteps the SSR/client hydration mismatch this
// file used to guard against.
/** @returns Always the literal 'dark'. */
export function useColorScheme() {
  return 'dark' as const;
}
