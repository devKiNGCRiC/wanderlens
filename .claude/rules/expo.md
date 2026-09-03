# Expo rules (SDK 54)

## Before writing code

Read https://docs.expo.dev/versions/v54.0.0/ for the specific module you're using.
SDK 54 changed enough that recalled API shapes are frequently wrong. This is the
single highest-value habit in this repo.

## Versioning

- Never hand-edit a dependency version in `package.json`. Use
  `npx expo install <pkg>` so the version resolves against SDK 54.
- `npx expo install --check` reports drift. Run it if anything behaves oddly
  after a dependency change.

## Config

Config is split across two files and both are live:

- `app.json` — static config (name, slug, icons, splash, scheme).
- `app.config.js` — a function that spreads `app.json` and appends plugins. It
  currently adds `@maplibre/maplibre-react-native` and configures `expo-location`
  with the `locationWhenInUsePermission` string.

New native config plugins go in `app.config.js`, appended to `config.plugins`.
Adding a config plugin invalidates the dev build — the user must rebuild.

## Dev builds, not Expo Go

This project uses `expo-dev-client` and MapLibre (a native module Expo Go does
not bundle). **Expo Go cannot run this app.** Never suggest scanning the QR code
in Expo Go as a fix.

- `npm start` — Metro against the existing dev build
- `npm run android` / `npm run ios` — compiles a new dev build

## Native folders

`/ios` and `/android` are gitignored and generated. Do not commit them, and do
not run `npx expo prebuild` without asking — it regenerates native projects and
can discard manual native edits.

## Routing (expo-router 6)

- Routes are files in `app/`. `(auth)` and `(tabs)` are groups — parentheses do
  not appear in the URL. `[id].tsx` is a dynamic segment.
- Navigate with `useRouter()` from `expo-router`, not React Navigation directly.
- Read params with `useLocalSearchParams()`.
- Screen options are declared in the parent `_layout.tsx` via `<Stack.Screen>`,
  not inside the screen component.
- **`<Stack.Protected guard={...}>` is how this app gates auth.** A new screen
  must be registered inside the correct guard in `app/_layout.tsx`.

## Environment variables

Only `EXPO_PUBLIC_*` variables reach the client bundle. They are **not secret** —
see `.claude/rules/security.md` before adding one.
