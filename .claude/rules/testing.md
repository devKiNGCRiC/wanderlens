# Testing and verification

## Honest current state

**Unit tests cover the pure logic only.** `jest-expo` runs the files in
`__tests__/` (named `*-test.ts`): `clusterSpots`, `goldenHour`, the
formatters (`formatTimeAgo`, `formatUserType`, `dateOnly`, the coordinate /
place-line / location-label helpers in `lib/geocoding.ts`) and the Feed's
`reuseUnchanged` helpers. There are **no component or screen tests** —
mocking Supabase, MapLibre and Reanimated is where that effort would go.
Don't call a UI change "tested" because the unit tests pass; say what was
actually verified.

Import test globals from `@jest/globals` (no `types` entry in tsconfig).
When you add pure logic to `lib/`, add a test file for it.

## The minimum bar before calling work done

```bash
npm run lint      # expo lint
npx tsc --noEmit  # type errors lint won't catch
npm test          # jest (unit tests)
```

All three must pass. Then state plainly what was and wasn't checked at runtime.

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
