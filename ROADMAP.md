# Roadmap

Status as of the MCA capstone build. Source of truth for "has this already been
considered" before proposing or building a feature — check here first.

## Next up

**Chat.** Schema is already built and RLS-secured — `conversations`,
`conversation_members`, `messages` — including a `security definer` helper
function that avoids a Postgres RLS self-reference recursion trap. What's
missing is UI and wiring only:

- Conversation list screen
- Message thread screen using Supabase Realtime
- "Message" entry point from a connected person's profile
- In-app notification bell (the `notifications` table already exists and is
  populated by triggers on connection events — no UI reads it yet)

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

## Known, accepted simplification

`lib/ai.ts` calls Groq and Gemini directly from the client with
`EXPO_PUBLIC_*` keys — extractable from a compiled build. For a capstone on
free tiers with no real financial exposure this is a reasonable, explicitly
acknowledged tradeoff. Before a real Play Store / App Store release, this must
move behind a Supabase Edge Function (see `.claude/rules/security.md`) — treat
that as a release blocker, not a nice-to-have, once this stops being a
classroom submission and starts being a public app.

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

1. **Move the Groq/Gemini keys server-side** — a Supabase Edge Function per
   key, holding the real secret, verifying the caller's JWT, rate-limited per
   user. See `.claude/rules/security.md`. This is the single most important
   item; both keys are extractable from any build shipped today.
2. **Full RLS audit** on every table, and especially on `conversations` /
   `messages` before chat ships to real users.
3. **Real push notifications** — `expo-notifications` + a server-side trigger.
4. **Error monitoring in production** (e.g. Sentry) — currently none.
5. **Store compliance** — privacy policy, data-safety declarations, an account
   deletion flow (required by both stores if accounts + user content exist).
6. Everything else in "Deferred for later" above, roughly in the order that
   matches user value once the above is solid.

## A lesson worth not re-learning

Changing an RPC function's return columns requires `drop function` before
`create or replace` — Postgres refuses an in-place return-type change. Came up
three times during this project.
