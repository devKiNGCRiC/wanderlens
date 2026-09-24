/**
 * Shared layout constants for the bottom tab bar.
 * Used by app/(tabs)/_layout.tsx (to size the bar) and context/TourProvider.tsx
 * (to compute where each tab button sits when the first-run tour highlights it).
 */
// Shared with the first-run tour so its tab-bar highlights can't drift from
// the real tab bar defined in app/(tabs)/_layout.tsx.
// Tab bar height before the device's bottom safe-area inset is added.
export const TAB_BAR_BASE_HEIGHT = 64;
// Number of tabs; the tour divides the bar width by this to locate each tab.
// Must be updated if a tab is added or removed.
export const TAB_COUNT = 5;
