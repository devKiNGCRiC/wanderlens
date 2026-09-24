/**
 * useColorScheme (native): always reports 'dark'.
 *
 * Purpose: replaces the Expo template hook that followed the OS light/dark
 * setting. app/_layout.tsx uses it to pick the navigation theme (always
 * DarkTheme), and hooks/use-theme-color.ts uses it to pick colors.
 *
 * Why hardcoded: the single dark "golden hour / blue hour" theme is a
 * deliberate design decision (see CLAUDE.md and .claude/rules/ui-ux.md). Do not
 * reintroduce OS-driven light mode without asking. The .web.ts sibling is the
 * web build's version; Metro picks it by file extension.
 */
// Wanderlens is deliberately dark-mode only — the golden-hour/blue-hour
// palette is the brand identity, not a togglable mode. Ignore the OS setting.
/** @returns Always the literal 'dark'. */
export function useColorScheme() {
  return 'dark' as const;
}
