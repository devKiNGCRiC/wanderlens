# Wanderlens

A social discovery platform for travelers and photographers, built as an MCA
capstone (2-month timeline, free-tier-only budget). Full background:
[Wanderlens_Abstract.md](Wanderlens_Abstract.md) and
[wanderlens-project-doc.md](wanderlens-project-doc.md) — read the project-doc
one before proposing a new feature; it already states what's built, what's
deliberately deferred, and why.

## The thesis — don't lose this in implementation

Existing travel apps (Mindtrip is the closest comparison) center an AI concierge
and treat social features as an afterthought. **Wanderlens inverts that:
community and connection are the product, AI is a supporting feature.** Three
pillars:

1. A crowdsourced, geo-tagged photo-spot map — real photographers' tips, not
   AI-generated recommendations.
2. A connection layer for meeting travelers/photographers by shared
   destination, dates, or genre — mutual, both-sides-agreed connections, not a
   follower count (see "Deliberate decisions" below).
3. Lightweight AI grounded in the app's own data — a trail generator that
   sequences *real community spots*, and a caption assistant. Not a general
   chatbot.

If a request would blur this line — e.g. "make the AI suggest a spot that
doesn't exist yet" or "add a public follower count" — say so before building it.

## Non-negotiable

**Expo has changed.** Before writing any Expo, expo-router, or native-module code,
read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/.
Do not rely on memory of older Expo APIs — SDK 54 moved a lot.

## Stack

| Layer | Choice |
|---|---|
| Runtime | Expo SDK 54, React Native 0.81.5, React 19.1 |
| Routing | expo-router 6 (file-based, `app/`) |
| Language | TypeScript, `strict: true`, `@/*` path alias to repo root |
| Backend | Supabase (auth, Postgres, storage, RPC) |
| State | React Context for auth; Zustand for cross-screen handoff |
| Maps | @maplibre/maplibre-react-native |
| Animation | react-native-reanimated 4 + react-native-worklets |
| AI | Groq `openai/gpt-oss-120b` (trail planning), Gemini `gemini-3.1-flash-lite` (photo captions) — see `lib/ai.ts` |
| Maps tiles | OpenFreeMap via MapLibre — deliberate choice over `react-native-maps`, which needs a Google Maps API key + billing account even for non-Google tiles |

## Layout

```
app/            expo-router routes. (auth) (tabs) groups, [id] dynamic routes
components/     Shared UI. PascalCase = app-specific, kebab-case = Expo template
constants/      theme.ts (design tokens), countries.ts, tagInfo.ts
context/        AuthProvider.tsx — session + profile, the single auth source
hooks/          useUserLocation, use-color-scheme, use-theme-color
lib/            supabase.js (client), ai.ts, pure helpers
store/          Zustand stores (locationPicker.ts)
```

## Built vs. in progress vs. deferred

**Built:** auth + onboarding, own/public profile, map with clustering, add spot
(3-way location: GPS / search / tap-to-pin), feed (personalized strips + filter
sheet + vertical feed), spot detail (threaded comments, likes, share), connect
(discover/requests/connections with full lifecycle), the two AI features.

**Schema exists, no UI yet — this is the next build, not a future one:**
`conversations`, `conversation_members`, `messages` (RLS already handles a known
Postgres self-reference recursion trap via a `security definer` helper
function — see `.claude/rules/supabase.md`), and `notifications` (already
populated by triggers on connection events). If asked to build chat, the schema
work is done; scope is screens + Realtime wiring + a notification bell only.

**Deliberately deferred — this list exists so these aren't re-proposed as new
ideas.** Full list with rationale in `wanderlens-project-doc.md` §8: voice/video
calling, real push notifications, PDF trail export, Edit Post (delete-and-recreate
only today), public/private accounts, stories, OTP signup, forgot-password,
a live sunrise/sunset feed API, a `ShapeSource`/`SymbolLayer` map-pin rewrite
(current `ViewAnnotation` approach has a known async-image snapshot-timing
quirk, mitigated by pre-fetching), an activity tracker.

## Deliberate decisions — don't "fix" these

- **No follower/following model.** Connections are mutual and both-sides-agreed
  on purpose — the app is for meeting people to travel/shoot with, not
  broadcasting to an audience.
- **No repost feature.** Considered and cut — real complexity for little demo
  value.
- **Single dark theme is the intended design** — "golden hour / blue hour" is
  the whole identity, not a togglable mode, the way VSCO or Halide commit to one
  look. `hooks/use-color-scheme.ts` and `.web.ts` are hardcoded to return
  `'dark'` regardless of the OS setting, so `app/_layout.tsx` always resolves to
  `DarkTheme`. Don't reintroduce OS-driven light mode without asking — it was a
  live contradiction of the stated design intent, fixed deliberately.
- **The Photo-Trail Generator is the itinerary generator.** A broader multi-day
  trip planner was deliberately not built — it would drift back toward
  Mindtrip's exact positioning this project exists to differentiate from.

## Things that will bite you

- **Auth gating lives in one place:** `app/_layout.tsx` uses `<Stack.Protected guard={...}>`
  for three states — signed out, signed in but not onboarded, fully onboarded.
  Add new screens to the correct guard block or they will be unreachable.
- **`AuthProvider` drives everything downstream.** It listens only to
  `onAuthStateChange` (no separate `getSession()` call) and sets `loading` false
  from inside that listener. Don't add a competing session fetch.
- **Reads go through RPCs, writes go through tables.** Existing RPCs:
  `feed_spots`, `nearby_spots`, `nearby_photographers`, `discover_people`,
  `get_spot`, `get_spot_comments`, `get_saved_spots`, `get_connection_status`.
  Prefer extending an RPC over assembling data with client-side joins.
- **Screens refresh with `useFocusEffect`, not `useEffect`.** Tab screens must
  re-fetch on focus or stale data shows after navigating back.
- **`lib/supabase.js` is JavaScript** while the rest of the codebase is TypeScript.
  Converting it is fine; don't assume it's typed.

## Commands

```bash
npm start          # expo start
npm run android    # expo run:android (needs dev build, not Expo Go)
npm run lint       # expo lint — run this before saying work is done
```

This project uses `expo-dev-client` and MapLibre, so **Expo Go will not work**.

## Detailed rules — read on demand

Read the relevant file before doing that kind of work. Don't read them all.

| Read this | Before |
|---|---|
| `.claude/rules/expo.md` | Touching Expo SDK, router, or native modules |
| `.claude/rules/react-native.md` | Writing components, lists, or animations |
| `.claude/rules/typescript.md` | Adding types or refactoring |
| `.claude/rules/ui-ux.md` | Any visual work |
| `.claude/rules/supabase.md` | Queries, RPCs, auth, storage |
| `.claude/rules/security.md` | Anything touching keys, `.env`, or user data |
| `.claude/rules/architecture.md` | Adding a screen, store, or module |
| `.claude/rules/testing.md` | Verifying a change |
| `.claude/rules/git.md` | Committing |
| `ROADMAP.md` | Deciding whether a requested feature is new, in-progress, or already deferred |

## Working agreement

- Match the file you're editing. This codebase uses local `StyleSheet.create` at the
  bottom of each screen, inline `type` declarations above the component, and
  `theme` tokens from `constants/theme.ts`. Follow that; don't introduce a
  styling library.
- Never commit unless asked.
- Run `npm run lint` before reporting a task complete.
