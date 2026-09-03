# Architecture

## Where code goes

| Directory | Holds | Does not hold |
|---|---|---|
| `app/` | Routes only — one screen per file | Reusable components, business logic |
| `components/` | Presentational, reusable UI | Screen-specific one-offs, data fetching |
| `lib/` | Clients and pure functions | React, hooks, JSX |
| `hooks/` | Reusable stateful logic | Anything used by exactly one screen |
| `constants/` | Static data and design tokens | Anything computed at runtime |
| `context/` | App-wide providers (auth today) | Feature-local state |
| `store/` | Zustand stores for cross-screen handoff | State a single screen owns |

Naming: `components/` mixes `PascalCase.tsx` (this app's own) with
`kebab-case.tsx` (surviving Expo template files). New components use PascalCase.

## Data flow

```
Supabase ──RPC──► screen (useFocusEffect) ──props──► component
              └──► AuthProvider ──useAuth()──► any screen
```

- **Server data** is fetched by the screen that displays it. There is no global
  cache layer; screens re-fetch on focus. Don't introduce React Query without
  discussing it — it would change every screen.
- **Auth state** is global, via `AuthProvider` + `useAuth()`.
- **Ephemeral cross-screen handoff** uses Zustand. `store/locationPicker.ts` is
  the model: `pick-location.tsx` writes a coordinate, `add-spot.tsx` reads it
  after navigating back. Use this only for a modal handing a value to its opener.

## State decision

```
Used by one screen?              → useState
Passed 2+ levels down one tree?  → props, then a local context
Auth / session?                  → useAuth()
Modal returning a value?         → Zustand store
Server data?                     → fetch in the screen on focus
```

## Adding a screen

1. Create `app/<name>.tsx` (or the right route group).
2. Register it in `app/_layout.tsx` inside the correct `<Stack.Protected>` guard —
   signed-out, onboarding, or authenticated. **Skipping this makes it unreachable.**
3. Set `presentation: 'modal'` there if it's a modal, matching the existing
   `add-spot` / `edit-profile` entries.
4. Wrap in `<ScreenBackground>`; pull styling from `theme`.
5. Fetch with `useFocusEffect`.

## Splitting files

Screens here run 130–330 lines and that's fine. Extract when a screen passes
~350 lines, when a block of JSX is used twice, or when a piece of logic is worth
testing on its own — not merely because a file "feels long."
