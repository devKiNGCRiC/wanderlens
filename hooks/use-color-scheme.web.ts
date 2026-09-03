// Wanderlens is deliberately dark-mode only — see hooks/use-color-scheme.ts.
// A constant return also sidesteps the SSR/client hydration mismatch this
// file used to guard against.
export function useColorScheme() {
  return 'dark' as const;
}
