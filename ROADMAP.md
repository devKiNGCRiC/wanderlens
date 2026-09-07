# Roadmap

Status as of the MCA capstone build. Source of truth for "has this already been
considered" before proposing or building a feature — check here first.

## Next up

Chat and the notification bell (both listed as "Next up" previously) are now
fully built: 1:1 and group messaging with every media type (photo/collage/
grid, video, voice notes, documents, location, spot-share), replies,
reactions, search, block/report, group management, and an in-app notification
bell covering both connection events and social events (likes, comments,
replies, comment likes, spot-shared-in-chat, message requests). A full RLS
audit has also been done across the chat/notification tables and the legacy
tables predating migration tracking (see `supabase/migrations/` from
`20260903000000` through `20260926000000` for the phase history and the fixes
that audit produced). Nothing is currently queued here — see "Deferred for
later" below for what's deliberately not built, or propose something new.

## Deferred for later / post-submission

Consciously scoped out, not overlooked. Each has a real reason — read it before
re-proposing the feature as new:

| Feature | Why it's deferred |
|---|---|
| Voice/video calling | Needs WebRTC infra (LiveKit, Stream Video, Agora) — a different order of engineering problem from the rest of the app |
| Real push notifications | Needs `expo-notifications` + a server-side trigger (Supabase Edge Function) |
| PDF export of saved trails | Needs `expo-print`; waiting on the save feature itself being solid first |
| Edit Post | Spots are delete-and-recreate only today |
| Public/private account toggle | Not a flag — every read policy on `spots`/`profiles`/eventually `messages` would need connection-status-aware RLS |
| Stories + highlights | Comparable in scope to everything built so far combined |
| OTP-based signup | Real hardening, needs custom email templates + deep-link handling |
| Forgot-password flow | Supabase supports it; screen + deep-link handling not built |
| Live golden-hour countdown | Feed hero's "GOLDEN HOUR · SOON" is static copy; a free sunrise/sunset API would make it live |
| Map pin rendering rewrite | Current `ViewAnnotation` approach has a known async-image snapshot-timing quirk. Mitigated today by pre-fetching images before render — works, not fully robust. A `ShapeSource` + `SymbolLayer` rewrite is the complete fix |
| Activity tracker feed | Considered, dropped — low value for a capstone demo |

## Resolved simplifications

`lib/ai.ts` used to call Groq and Gemini directly from the client with
`EXPO_PUBLIC_*` keys — extractable from a compiled build. This is now fixed:
both calls go through Supabase Edge Functions (`generate-trail`,
`generate-caption`) that hold the real keys server-side, verify the caller's
JWT, and rate-limit per user. See `.claude/rules/security.md` and
`supabase/migrations/20260927000000_ai_usage_quota.sql`. Still required
before a public release regardless: **rotate both keys** — they shipped in
every build made before this fix, and moving them server-side doesn't
un-leak keys already in artifacts that exist.

## Tooling: graphify (decided, revisit later)

Considered and declined for now. Graphify builds a knowledge graph of the
codebase so Claude queries structure instead of re-reading files each
session — a token-efficiency tool, not a feature-building one. It doesn't make
hard features (chat/Realtime, WebRTC calling, push notifications) easier; those
are hard because of the underlying engineering, not because Claude forgets the
file layout. At ~2,800 lines the CLAUDE.md + `.claude/rules/` structure already
covers that job. Revisit only if the codebase grows substantially (several
times its current size) and Claude visibly struggles to hold the structure in
a session — not simply because a feature is large.

## The actual checklist for "real-world deployable," not graphify

This is the plan's real intent — going from capstone to a public app on the
Play Store / App Store. In rough priority order:

1. ~~Move the Groq/Gemini keys server-side~~ — done, see "Resolved
   simplifications" above. Still owed: rotating both keys, since prior builds
   already shipped them.
2. ~~Full RLS audit~~ — done across chat/notifications and the legacy
   pre-migration-tracking tables. Re-run informally whenever a new table or
   RPC is added, rather than as a standing checklist item.
3. **Real push notifications** — `expo-notifications` + a server-side trigger.
   Deliberately deferred (see CLAUDE.md) — do not re-propose without the user
   asking; the "real-world deployable" framing here doesn't override that.
4. ~~Error monitoring in production~~ — done. `@sentry/react-native` is wired
   in (`app/_layout.tsx`, `metro.config.js`, the `@sentry/react-native/expo`
   plugin in `app.config.js`), disabled in `__DEV__` so local development
   doesn't spam the project. Requires `EXPO_PUBLIC_SENTRY_DSN` in `.env` and
   `SENTRY_AUTH_TOKEN` as an EAS secret (source-map upload only, never
   client-side) — both are the user's own Sentry account credentials.
5. **Store compliance** — privacy policy and data-safety declarations still
   needed (both require the user's own factual input, not something to draft
   speculatively). ~~Account deletion~~ — done:
   `supabase/functions/delete-account`, wired up from a "Danger zone" in
   `app/edit-profile.tsx`. Anonymizes `profiles` in place (spots/messages
   stay attributed to "Deleted user," per the product decision that
   crowdsourced spots have value beyond their contributor) and soft-deletes
   the `auth.users` row via `auth.admin.deleteUser(id, true)` — the first
   service-role-key usage in this project, worth an extra review pass before
   it ships.
6. Everything else in "Deferred for later" above, roughly in the order that
   matches user value once the above is solid.

## A lesson worth not re-learning

Changing an RPC function's return columns requires `drop function` before
`create or replace` — Postgres refuses an in-place return-type change. Came up
three times during this project.
