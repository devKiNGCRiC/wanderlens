# React Native patterns

## Component shape

Match the existing files. The house style, visible in `app/(tabs)/index.tsx`:

1. Imports — React, then RN, then third-party, then `@/` locals
2. `type` declarations for row shapes, above the component
3. `export default function ScreenName()` for routes; named exports for components
4. `StyleSheet.create` at the **bottom** of the file
5. Never inline a style object that could be a `StyleSheet` entry

## Lists

- Use `FlatList` for anything unbounded. Never `.map()` inside a `ScrollView`
  for feed, grid, or search results.
- Always pass a stable `keyExtractor` — use the row's `id`, never the index.
- Memoize `renderItem` with `useCallback` and the row component with `React.memo`
  when the list can exceed ~20 items.
- For the polaroid grid, keep item height fixed so `getItemLayout` stays possible.

## Data fetching on screens

Tab screens re-mount rarely, so `useEffect` with `[]` leaves stale data on the
screen when the user navigates back. **Use `useFocusEffect` + `useCallback`** —
this is the established pattern across the tab screens.

Fire independent requests concurrently. `app/(tabs)/index.tsx` builds a `tasks`
array and awaits it as a batch; follow that rather than sequential `await`s.

Guard against setting state after unmount when a request can outlive the screen.

## Images

Use `expo-image`'s `<Image>` for remote photos — it caches and decodes better
than RN's. Reserve RN `Image` for local static assets already using it.
Always set explicit dimensions or an aspect ratio so the list doesn't reflow.

## Animation

`react-native-reanimated` v4 with `react-native-worklets`. Keep animations on the
UI thread — `useSharedValue` / `useAnimatedStyle`. Don't drive animation from
React state in a loop. Reanimated must stay imported at the top of
`app/_layout.tsx`.

## Touch and feedback

`Pressable` over `TouchableOpacity` for new code. This app uses `expo-haptics` —
match the existing haptic weight on primary actions (see `haptic-tab.tsx`).

## Platform and safety

- `react-native-safe-area-context` for insets, not hardcoded padding.
- Branch with `Platform.OS` / `Platform.select` rather than assuming Android.
- Test the keyboard path on forms — the repo already depends on
  `@codler/react-native-keyboard-aware-scroll-view`.
