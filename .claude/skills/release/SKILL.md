---
name: release
description: Pre-release checklist for Wanderlens — verify the build config, secrets, permissions, and RLS before an EAS build. Use before shipping a build to TestFlight, Play, or testers.
---

# Release checklist

**Claude does not run `eas build` or `eas submit`** — both are denied in
`.claude/settings.json`. This skill prepares and verifies; the user runs the
build.

## 1. Code is clean

```bash
git status          # nothing unexpected, no .env, no keystore
npm run lint
npx tsc --noEmit
```

Run the `review-changes` skill over everything since the last release tag.

## 2. Security gate — blocking

Run the `security-reviewer` subagent. Then confirm by hand:

- [ ] **Groq/Gemini keys were rotated after moving behind Edge Functions.**
      They now live server-side only (`supabase/functions/generate-trail`,
      `generate-caption`), but every build shipped before that change still
      has the old keys embedded and extractable. Moving them server-side
      doesn't un-leak a key that already shipped — confirm both were rotated
      at Groq/Google AI Studio and the new values are set via
      `supabase secrets set`, not just that the client no longer reads them.
      Also confirm `lib/ai.ts` has no direct vendor `fetch()` and no
      `EXPO_PUBLIC_*` vendor key was reintroduced.
- [ ] RLS is enabled and correct on every table: `profiles`, `spots`,
      `spot_likes`, `spot_comments`, `comment_likes`, `saved_spots`,
      `connections`, `trails`
- [ ] Storage policies on `spot-photos` and `profile-media` restrict writes to
      the owner's prefix
- [ ] No secret in the diff, no credentials file committed
- [ ] No `console.log` of tokens, emails, or coordinates

## 3. Config

- [ ] `version` bumped in `app.json`
- [ ] Android `versionCode` / iOS `buildNumber` incremented
- [ ] `app.config.js` plugins correct; `expo-location` permission string still
      accurate for the store listing
- [ ] `npx expo config --type public` output looks right
- [ ] `npx expo install --check` reports no drift
- [ ] `eas.json` profile is the one intended
- [ ] Every `EXPO_PUBLIC_*` the app reads is set in the EAS build environment —
      a missing one fails at runtime, not at build time

## 4. Manual smoke test on a real build

- [ ] Fresh install → signup → onboarding → feed
- [ ] Signed-out, onboarding, and onboarded guards all route correctly
- [ ] Location permission prompt appears with the right copy; denial handled
- [ ] Map renders (MapLibre is native — a config change needs a rebuild)
- [ ] Add a spot with a photo; upload completes
- [ ] AI caption and AI trail generation both work against production keys
- [ ] Airplane mode → every screen shows its error state, not a blank

## 5. Ship

Hand the user the exact command; let them run it.

```bash
eas build --platform android --profile <profile>
```

## 6. After

Tag the release, and note anything shipped as a known issue — especially if the
AI keys went out on the client again.
