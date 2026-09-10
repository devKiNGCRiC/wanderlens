# Wanderlens 🌍📸

A cross-platform mobile app built with Expo and React Native that puts community
first: a crowdsourced, geo-tagged photo-spot map, mutual (double-opt-in)
connections between travelers and photographers, and full chat — with a
lightweight AI trail generator and caption assistant layered on top, not the
centerpiece. See [`Wanderlens_Abstract.md`](Wanderlens_Abstract.md) and
[`wanderlens-project-doc.md`](wanderlens-project-doc.md) for the full project
background, and [`ROADMAP.md`](ROADMAP.md) for what's built vs. deferred.

## Overview

Wanderlens is a social discovery platform for travelers and photographers. It
enables users to:

- **Discover** nearby photography spots on an interactive map, added by real
  community members — not AI-generated suggestions
- **Share** photos with genre tags, threaded comments, and likes
- **Connect** with other travelers and photographers by destination, dates, or
  genre — connections are mutual and both-sides-agreed, not a follower count
- **Message** 1:1 or in groups — photos, video, voice notes, documents,
  location and spot sharing, replies, reactions, and search
- **Generate a photo trail** with AI that sequences real community spots
  (not invented ones), and get AI caption suggestions for a new post
- **Get notified** in-app for connection requests and social activity (likes,
  comments, replies, shares)
- **Save** favorite spots for later, and manage their own account fully,
  including deleting it

## Features

- 📍 **Location-based discovery** — nearby spots via PostGIS-backed queries
- 🗺️ **Interactive map** — MapLibre with clustering; add a spot via GPS,
  search, or tap-to-pin
- 🎨 **Feed** — personalized strips, a filter sheet, and a vertical feed
- 💬 **Chat** — 1:1 and group messaging with every common media type, replies,
  reactions, search, block/report, and group management
- 🔔 **Notifications** — an in-app bell covering connection and social events
- 🤝 **Connections** — discover people, send/accept requests, mutual only
- 🤖 **AI trail generator & caption assistant** — grounded in the app's own
  spot data, served through Supabase Edge Functions (see below), never
  calling the AI vendor from the client
- 👤 **Profiles** — photographer/traveler type, genres, travel style, home
  city, with edit and public view
- 🔐 **Full account lifecycle** — email/password auth, onboarding, a
  deep-link-based forgot-password flow, and account deletion that anonymizes
  personal data while preserving the spots a user contributed to the map
- 🛠️ **Error monitoring** — Sentry, disabled in local development
- 🎭 **User types** — distinct traveler / photographer / both profiles

## Tech Stack

- **Frontend**: React Native 0.81.5, React 19.1, Expo SDK 54
- **Language**: TypeScript 5.9, `strict: true`
- **Navigation**: Expo Router 6 (file-based routing)
- **State**: React Context for auth, Zustand for ephemeral cross-screen
  handoff (server data is fetched per-screen, no global cache layer)
- **Backend**: Supabase — Postgres, Auth, Storage, Realtime, Edge Functions
  (Deno), Row Level Security enforced on every table
- **AI**: Groq (`openai/gpt-oss-120b`) for trail planning, Gemini
  (`gemini-3.1-flash-lite`) for captions — both called from Supabase Edge
  Functions, never from the client; per-user rate-limited
- **Maps**: `@maplibre/maplibre-react-native` with OpenFreeMap tiles —
  deliberately not `react-native-maps`, which needs a billed Google Maps key
  even for non-Google tiles
- **Animation**: `react-native-reanimated` 4 + `react-native-worklets`
- **Error monitoring**: `@sentry/react-native`
- **Platform support**: iOS, Android (this app uses `expo-dev-client` and a
  native map module, so **Expo Go cannot run it** — see Getting Started)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- For Android: Android Studio + SDK, or use a cloud build (see below)
- For iOS: Xcode and CocoaPods (macOS only)
- A Supabase project (free tier is enough) if you're standing up your own
  backend rather than pointing at an existing one

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/devKiNGCRiC/wanderlens
   cd Wanderlens
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables** — create a `.env` file (not
   `.env.local`) in the project root:

   ```
   EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   EXPO_PUBLIC_SENTRY_DSN=your_sentry_dsn   # optional — omit to skip error monitoring
   ```

   `EXPO_PUBLIC_*` values are inlined into the JS bundle at build time, so
   only ever put something here that's safe to be public — the anon key is
   fine precisely because RLS is enforced on every table. **The Groq and
   Gemini AI keys are not client env vars** — they live only as Supabase Edge
   Function secrets (see Backend Setup below).

4. **Build a dev client — you can't use Expo Go for this project.**
   `expo-dev-client` and the native MapLibre module aren't in Expo Go.

   ```bash
   npm run android   # or npm run ios (macOS only)
   ```

   This compiles and installs a dev client once. After that:

   ```bash
   npm start
   ```

   connects to the already-installed dev client and gives you live reload for
   any JS change — no rebuild needed unless you add a native dependency or
   change a config plugin.

### Backend setup (if standing up your own Supabase project)

1. Run every file in `supabase/migrations/` in order, in the Supabase SQL
   editor (they're not yet tracked by the Supabase CLI's migration history,
   so `supabase db push` isn't used here — apply them by hand).
2. `supabase login`, `supabase init`, `supabase link --project-ref <your-ref>`.
3. Set the AI Edge Function secrets:
   ```bash
   supabase secrets set GROQ_API_KEY=your_groq_key GEMINI_API_KEY=your_gemini_key
   ```
4. Deploy the Edge Functions:
   ```bash
   supabase functions deploy generate-trail
   supabase functions deploy generate-caption
   supabase functions deploy delete-account
   ```
   `delete-account` needs no extra secret — it uses the service-role key
   Supabase auto-injects into every Edge Function.
5. In **Authentication → URL Configuration → Redirect URLs**, add
   `wanderlens://reset-password` so the forgot-password email link works.

## Project Structure

```
Wanderlens/
├── app/                          # expo-router routes — one screen per file
│   ├── (auth)/                   # Signed-out: login, signup, forgot-password
│   ├── (tabs)/                   # Feed, Map, Connect, Chat, Profile
│   ├── chat/[id].tsx             # 1:1 and group conversation screen
│   ├── group/[id].tsx            # Group management
│   ├── spot/[id].tsx             # Spot detail
│   ├── user/[id].tsx             # Public profile
│   ├── add-spot.tsx              # Add a spot (GPS / search / tap-to-pin)
│   ├── edit-profile.tsx          # Edit profile
│   ├── reset-password.tsx        # Deep-link landing screen for password reset
│   ├── notifications.tsx         # Notification bell
│   ├── onboarding.tsx            # Post-signup onboarding
│   └── about.tsx                 # About screen (from the profile menu)
├── components/                   # Shared UI — chat/ holds chat-specific ones
├── context/                      # AuthProvider, ChatProvider, NotificationsProvider
├── hooks/                        # useUserLocation, use-color-scheme, etc.
├── lib/                          # supabase.js (client), ai.ts, chat.ts, media.ts
├── store/                        # Zustand — e.g. locationPicker.ts
├── constants/                    # theme.ts (design tokens), countries.ts
├── supabase/
│   ├── migrations/               # Full schema + RLS history, in order
│   └── functions/                # Edge Functions: generate-trail,
│                                  # generate-caption, delete-account
├── package.json
├── app.json / app.config.js      # Expo config (static + plugin-appending)
├── eas.json                      # Build profiles: development, preview, production
└── tsconfig.json
```

## Key Dependencies

**Core**: `expo`, `react`, `react-native`, `typescript`

**Navigation**: `expo-router`, `@react-navigation/*`

**Backend**: `@supabase/supabase-js`, `@react-native-async-storage/async-storage`

**UI**: `expo-linear-gradient`, `@expo/vector-icons`, `expo-image`,
`react-native-reanimated`, `react-native-gesture-handler`,
`react-native-svg`

**Map & location**: `@maplibre/maplibre-react-native`, `expo-location`

**Media**: `expo-image-picker`, `expo-video`, `base64-arraybuffer`

**Error monitoring**: `@sentry/react-native`

**State**: `zustand`

## Development

```bash
npm start          # expo start — connects to an existing dev client
npm run android    # expo run:android — builds and installs a dev client
npm run ios        # expo run:ios — macOS only
npm run lint        # expo lint
npx tsc --noEmit    # type check (lint alone won't catch these)
```

There is no test framework installed yet — lint + type-check is the current
bar before calling a change done. See `.claude/rules/testing.md` for the
manual verification checklist this project uses instead, and for what a
future test setup would start with.

### File-based routing

Screens are files in `app/`. `(auth)` and `(tabs)` are route groups —
parentheses don't appear in the URL. `[id].tsx` is a dynamic segment. Auth
gating is centralized in `app/_layout.tsx` via `<Stack.Protected guard={...}>`
for four states: password-recovery-in-progress, signed out, signed in but not
onboarded, and fully onboarded. See
[Expo Router docs](https://docs.expo.dev/router/introduction/).

## Authentication & account lifecycle

- Email/password auth via Supabase, with extended profile info (genres,
  travel style, home city, user type) collected during onboarding
- A deep-link-based **forgot-password** flow (`app/(auth)/forgot-password.tsx`
  → email → `app/reset-password.tsx`), kept independent of normal session
  state so a recovery link can't get silently routed into the app before a
  new password is set
- **Account deletion**, reachable from the profile menu: personal data
  (saved spots, likes, connections, trails, notifications) is removed, and
  the profile is anonymized to "Deleted user" rather than deleted outright —
  spots a user contributed stay on the map, since they have value to the
  community beyond their original poster. The `auth.users` row is
  soft-deleted (`auth.admin.deleteUser(id, true)`), which hashes the
  credentials and purges sessions without breaking anything still
  referencing the now-anonymized profile row

## Database schema

Supabase Postgres, with Row Level Security enforced on every table. Major
areas, all under `supabase/migrations/`:

- **Core**: `profiles`, `spots`, `spot_likes`, `spot_comments`,
  `comment_likes`, `saved_spots`, `connections`, `trails`
- **Chat**: `conversations`, `conversation_members`, `messages` — 1:1 and
  group, every media type, replies, reactions
- **Notifications**: `notifications`, populated by triggers on connection and
  social events
- **AI usage**: `ai_usage` — per-user, per-feature rate limiting for the two
  AI Edge Functions
- Location queries (`nearby_spots`, `nearby_photographers`) are backed by
  PostGIS on a `geography` column

## Error monitoring

`@sentry/react-native` is wired in (`app/_layout.tsx`, `metro.config.js`, and
the `@sentry/react-native/expo` config plugin), disabled whenever `__DEV__` is
true so local development never spams the project. Requires
`EXPO_PUBLIC_SENTRY_DSN` to be set wherever the app is built — see Getting
Started above and `.claude/skills/release/SKILL.md` for the full release
checklist.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE)
file for details.

## Support

For issues, feature requests, or questions, please open an issue on the
repository.

## Additional resources

- [Expo Documentation](https://docs.expo.dev/)
- [Expo v54.0.0 Release](https://docs.expo.dev/versions/v54.0.0/) — this
  project targets this exact version; API shapes from memory are often wrong
- [React Native Documentation](https://reactnative.dev/)
- [Supabase Documentation](https://supabase.com/docs)
- [MapLibre Documentation](https://maplibre.org/)
