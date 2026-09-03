---
name: debug
description: Systematic debugging workflow for Wanderlens, including the known failure patterns in this codebase. Use when something is broken, crashing, showing stale data, or behaving differently in a build than in dev.
---

# Debugging Wanderlens

## Before anything, check the cheap ones

Most bugs here are one of these. Rule them out first — it takes a minute.

| Symptom | Usual cause |
|---|---|
| Stale data after navigating back | `useEffect` where `useFocusEffect` belongs |
| Route not found / screen unreachable | Not in the right `<Stack.Protected>` guard |
| Blank screen, no error | Unhandled Supabase `error`; `data` is null |
| Crash on a detail screen | `.single()` on a row that doesn't exist |
| Stuck on splash, or auth flicker | Something racing `AuthProvider` |
| Permission denied from Supabase | RLS policy, not client code |
| Font falls back to system | Weight not registered in `useFonts` |
| Native module is undefined | Running Expo Go — this app needs the dev build |
| Works in dev, broken in build | Missing `EXPO_PUBLIC_*` at build time, or a config plugin change without a rebuild |

## Method

1. **Pin the symptom.** Which screen, which auth state (signed out / onboarding /
   onboarded), reproducible or intermittent, dev or build. Ask if unclear —
   guessing here wastes the whole investigation.
2. **Get the real error.** Metro logs, the red box, and `adb logcat` for native
   crashes. A paraphrased error is not the error.
3. **Trace backward:** render → state → fetch → RPC/table → `AuthProvider`.
   Find the first point where the value is already wrong.
4. **Isolate the layer.** Run the query against Supabase directly. If it fails
   there, it's a backend or RLS problem and no client change will fix it.
5. **Hypothesize, then attack your own hypothesis.** Read the code that would
   have to be true. Abandon it the moment evidence contradicts it.
6. **Fix the cause, not the symptom.** A `?.` that hides a null is not a fix if
   the null shouldn't exist.
7. **Verify** the original repro, then the neighbouring paths the fix touches.

For a hard bug, delegate the investigation to the `debugging-agent` subagent so
the search doesn't consume the main context.

## Don't

- Don't add `try/catch` that swallows the error to make a red box go away.
- Don't change three things at once — you'll never know which mattered.
- Don't claim it's fixed without reproducing the original failure first.
- Don't guess at Expo SDK 54 API shapes. Read
  https://docs.expo.dev/versions/v54.0.0/.
