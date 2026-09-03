# Testing and verification

## Honest current state

**There is no test framework installed.** No Jest, no Testing Library, no test
files. Do not claim a change is "tested" — say what was actually verified.

## The minimum bar before calling work done

```bash
npm run lint      # expo lint
npx tsc --noEmit  # type errors lint won't catch
```

Both must pass. Then state plainly what was and wasn't checked at runtime.

## Manual verification

The app needs a dev build (`npm run android`), not Expo Go. When a change can't
be run, say so and list what the user should check.

Per-change checklist:

- The happy path
- Empty state — no spots nearby, no connections, no saved items
- Error state — kill the network mid-request
- Signed out, and signed in but not onboarded (the three `<Stack.Protected>` guards)
- Navigate away and back — `useFocusEffect` should refresh, not duplicate rows
- Keyboard behaviour on any screen with a `TextInput`

## If tests get added

Start with `jest-expo` plus `@testing-library/react-native`, and cover the pure
logic first — `lib/clusterSpots.ts`, `lib/formatTimeAgo.ts`, `lib/formatUserType.ts`
are pure functions with real edge cases and no mocking cost. Component tests come
after; mocking Supabase, MapLibre, and Reanimated is where the effort goes.

Update this file when that happens.
