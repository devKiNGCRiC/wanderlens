// Wanderlens is deliberately dark-mode only — the golden-hour/blue-hour
// palette is the brand identity, not a togglable mode. Ignore the OS setting.
export function useColorScheme() {
  return 'dark' as const;
}
