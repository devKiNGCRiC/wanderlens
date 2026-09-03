# Security rules

## The one that matters most right now

`EXPO_PUBLIC_*` variables are **inlined into the JavaScript bundle at build
time**. Anyone can unzip a released APK/IPA and read them. They are configuration,
not secrets.

This project currently ships four:

| Variable | Safe to expose? |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes — public by design |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes — **only if RLS is enforced on every table** |
| `EXPO_PUBLIC_GROQ_API_KEY` | **No.** Billable third-party key, extractable from the build |
| `EXPO_PUBLIC_GEMINI_API_KEY` | **No.** Same problem |

The Groq and Gemini keys are billed to the project owner and have no per-user
scoping. Shipped in a public build, anyone can extract and spend against them.

**The fix** is to move both calls in `lib/ai.ts` behind a Supabase Edge Function:
the function holds the real key as a server-side secret, verifies the caller's
JWT, rate-limits per user, and the app calls the function instead of the vendor.
Raise this whenever AI code is touched; don't add a third vendor key on the
client.

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
