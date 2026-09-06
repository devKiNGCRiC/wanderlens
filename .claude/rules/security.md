# Security rules

## `EXPO_PUBLIC_*` variables

`EXPO_PUBLIC_*` variables are **inlined into the JavaScript bundle at build
time**. Anyone can unzip a released APK/IPA and read them. They are configuration,
not secrets — only ever put something here if it's fine for it to be public.

This project currently ships two:

| Variable | Safe to expose? |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes — public by design |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes — **only if RLS is enforced on every table** |

## AI calls go through Edge Functions, not the client

The Groq (trail generation) and Gemini (caption suggestion) API keys used to be
shipped as `EXPO_PUBLIC_GROQ_API_KEY`/`EXPO_PUBLIC_GEMINI_API_KEY` — extractable
from any build, billed to the project owner, no per-user scoping. That's fixed:
`lib/ai.ts` now calls `supabase.functions.invoke('generate-trail' | 'generate-caption', ...)`
instead of `fetch()`ing the vendor directly. The real keys live only as Supabase
Edge Function secrets (`GROQ_API_KEY`, `GEMINI_API_KEY` — no `EXPO_PUBLIC_`
prefix, set via `supabase secrets set`, never in `.env`).

Each function (`supabase/functions/generate-trail`, `supabase/functions/generate-caption`)
verifies the caller's JWT and rate-limits per user via `consume_ai_quota()`
(`supabase/migrations/20260927000000_ai_usage_quota.sql`) before spending a
vendor call — see that migration's header comment for why there's deliberately
no service-role key and no refund path. **Don't add a third vendor key to the
client** — if a new AI feature needs a key, it gets its own Edge Function
following this same pattern, never an `EXPO_PUBLIC_*` var.

## Secrets hygiene

- `.env` is gitignored. Keep it that way. Never paste its values into source,
  logs, commits, or a chat message.
- `.claude/settings.json` denies reading `.env` — that's deliberate. If a task
  needs to know which variables exist, read `app.config.js` or the usage sites.
- Never commit `*.jks`, `*.p8`, `*.p12`, `*.keystore`, or an EAS credentials
  file. `.gitignore` covers these; don't add exceptions.

## Authorization

RLS is the security boundary — the client is not. Assume every request the app
can make, an attacker can make with arbitrary parameters using the anon key.
Every new table and RPC ships with its policy.

## User data

- Location is sensitive. `expo-location` is requested as when-in-use. Don't
  broaden the permission, and consider whether an exact spot coordinate should be
  fuzzed before it's public.
- Don't log session tokens, emails, or coordinates — RN logs are readable via
  adb on a connected device.
- Never render remote strings into anything that evaluates them, and don't add a
  `WebView` that loads user-supplied URLs without an allowlist.

## Dependencies

New native dependency = new supply chain and a required rebuild. Prefer an Expo
first-party module. If nothing fits, say why before adding it.
