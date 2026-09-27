# Wanderlens

A social discovery app for travelers and photographers, built with Expo and
React Native as an MCA capstone project.

Most travel apps put an AI concierge at the center and treat the social side
as an afterthought. **Wanderlens does the opposite: community and connection
are the product, and AI is a supporting feature.** It rests on three pillars:

1. **A crowdsourced photo-spot map.** Real photographers post geo-tagged
   spots with tips. Nothing on the map is AI-generated.
2. **A connection layer.** Meet travelers and photographers by shared
   destination, dates or genre. Connections are mutual and agreed by both
   sides; there are no followers and no follower counts.
3. **Lightweight AI grounded in the app's own data.** A trail generator that
   sequences *real community spots* into a photo outing, and a caption
   assistant. It is not a general chatbot.

[`ROADMAP.md`](ROADMAP.md) lists what is built and what was deliberately
deferred.

---

## Features

### Discover
- **Feed**: a golden-hour/blue-hour countdown for your location, a "Spots
  near you" strip, a "Photographers who've shot nearby" strip, and a
  vertical feed with genre and time-of-day filters.
- **Map**: every spot in the area on screen, loaded as you pan and zoom, with
  pins that group spots a few metres apart. Tap a pin for a card with the
  photo and tips.
- **Spot detail**: photo, tips, likes, saves, threaded comments (edit and
  delete your own), sharing, and "View on map".

### Share
- **Add a spot** with its location from GPS, a place search, or by tapping
  the map. Location lookups fall back to OpenStreetMap when the phone's
  geocoder fails, which it does for disputed regions such as Arunachal
  Pradesh.
- **Geo-tag camera**: shoot in the app to record coordinates, altitude, the
  place name and address, and the current weather, and save a "stamped" copy
  with that information to your gallery.
- **Photo styles**: frames such as Polaroid, Film Retro, Vintage, Noir,
  Golden Hour and Blue Hour, with an optional caption. Use them on a new
  post, or in a standalone studio that saves the result to your gallery.
- **AI caption suggestions** for a new post.

### Connect
- **Discover people** by genre, or by **trip matching**: people whose planned
  trip shares a destination and overlapping dates with yours.
- **Mutual connections**: send, accept, decline, cancel and remove requests.
- **Public profiles** with each person's spots, and block and report.

### Chat
- 1:1 and group chats with photos, photo galleries, video, voice notes,
  documents, and shared locations and spots.
- Replies, reactions, read receipts, typing indicators, message search,
  archiving, and message requests from people you aren't connected to.
- Group management: name, photo, description, members and admins.

### Plan
- **AI photo trail**: pick a genre and a number of stops (3 to 6), and the AI
  orders real nearby spots into an outing with a tip for each stop. Save the
  trails you like to **My trails**.
- **Notes**: private notes, which can be linked to a spot.
- **Saved spots**: your bookmarked spots.

### Account
- Email/password sign-up with a live username check, onboarding, and
  forgot-password through an email deep link.
- An in-app **notification bell** for connection requests, likes, comments,
  replies, shares and message requests.
- A **first-run tour** that highlights the key controls, and can be replayed
  from the Profile menu.
- **Account deletion** that removes personal data and anonymizes the profile
  to "Deleted user", so spots stay on the map for the community.

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Expo SDK 54, React Native 0.81.5, React 19.1 |
| Language | TypeScript, `strict: true` |
| Routing | Expo Router 6 (file-based, `app/`) |
| Backend | Supabase: Postgres + PostGIS, Auth, Storage, Realtime, Edge Functions (Deno). Row Level Security on every table |
| State | React Context for auth, chat and notifications; Zustand to pass values between screens; each screen fetches its own server data |
| Maps | `@maplibre/maplibre-react-native` with free [OpenFreeMap](https://openfreemap.org) tiles |
| Geocoding | `expo-location`, with [Nominatim](https://nominatim.org) (OpenStreetMap) as a fallback |
| AI | Groq `openai/gpt-oss-120b` (trails), Gemini `gemini-3.1-flash-lite` (captions), both called only from Edge Functions |
| Other APIs | [Open-Meteo](https://open-meteo.com) (weather), [sunrise-sunset.org](https://sunrise-sunset.org) (golden hour) |
| Animation | `react-native-reanimated` 4 + `react-native-worklets` |
| Error monitoring | `@sentry/react-native` (off in development) |

Every external service is free or on a free tier. That was a project
constraint, and it is why the map uses MapLibre and not `react-native-maps`,
which needs a billed Google Maps key even for non-Google tiles.

**Design.** The app has one dark "golden hour / blue hour" theme on purpose.
It does not follow the phone's light/dark setting. Colors, fonts and radii
all come from `constants/theme.ts`.

---

## Getting started

> **Expo Go cannot run this app.** It uses `expo-dev-client` and a native map
> module (MapLibre) that Expo Go doesn't include, so you need a development
> build.

### Prerequisites
- Node.js 20.19.4 or newer (React Native 0.81 requires it), and npm
- Android: Android Studio with an SDK and an emulator or device. iOS: Xcode
  (macOS only). Or build in the cloud with EAS (`eas.json` is included).
- A Supabase project (the free tier is enough). See [Backend setup](#backend-setup).

### Install and run

```bash
git clone https://github.com/devKiNGCRiC/wanderlens.git
cd wanderlens
npm install
```

Create a `.env` file in the project root:

```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
EXPO_PUBLIC_SENTRY_DSN=your_sentry_dsn   # optional
```

`EXPO_PUBLIC_*` values are compiled into the app and can be read by anyone
who has it. Only put public values here. The anon key is safe because Row
Level Security protects every table. **The AI keys do not go in `.env`.**
They are Supabase secrets (see below).

Build and install the development app once, then start the dev server:

```bash
npm run android      # or: npm run ios   (compiles the development app)
npm start            # afterwards: live reload for JavaScript changes
```

You only need to rebuild after adding a native dependency or changing a
config plugin in `app.config.js`.

### Backend setup

> **Known gap:** `supabase/migrations/` does **not** hold the full schema yet.
> The core tables (`profiles`, `spots`, `spot_likes`, `spot_comments`,
> `comment_likes`, `saved_spots`, `connections`, `trails`) and the older RPCs
> (`feed_spots`, `nearby_spots`, `discover_people`, `get_spot`,
> `get_spot_comments`, `get_saved_spots`, `get_connection_status`,
> `handle_new_user`) were created in the Supabase dashboard before migrations
> were tracked. The migrations cover everything added after that: chat,
> notifications, AI quotas, account deletion, trips, geo-tags, notes, and
> `nearby_photographers`. Setting up a fresh project from this repo alone is
> not possible yet.

On the existing project:

1. Apply new migration files **by hand** in the Supabase SQL Editor, in
   filename order. Don't use `supabase db push`: the remote migration
   history is empty, so it would try to replay every migration and fail on
   objects that already exist. If the app then reports a missing column,
   run `notify pgrst, 'reload schema';` so the API picks up the change.
2. Link the CLI: `supabase login`, then `supabase link --project-ref <your-ref>`.
3. Set the AI secrets:
   ```bash
   supabase secrets set GROQ_API_KEY=your_groq_key GEMINI_API_KEY=your_gemini_key
   ```
4. Deploy the Edge Functions:
   ```bash
   supabase functions deploy generate-trail generate-caption delete-account
   ```
   `delete-account` needs no extra secret. It uses the service-role key that
   Supabase gives every Edge Function.
5. In **Authentication → URL Configuration → Redirect URLs**, add
   `wanderlens://reset-password` so the password-reset email link opens the
   app.

---

## How it works

### Navigation and auth gating
Every file in `app/` is a route. `(auth)` and `(tabs)` are route groups (the
parentheses don't appear in the URL), and `[id].tsx` files are dynamic
routes. Access control lives in one place, `app/_layout.tsx`, which has four
`<Stack.Protected>` blocks:

1. Password recovery in progress: only the reset-password screen
2. Signed in and onboarded: the whole app
3. Signed in, not onboarded: only onboarding
4. Signed out: login, sign-up and forgot-password

Exactly one block is active at a time. When the user signs in or out, the
router moves them automatically. **A new screen must be registered inside
the right block,** or it can be reached regardless of whether the user is
signed in.

### Data
- **Reads go through RPCs** (Postgres functions such as `feed_spots` and
  `nearby_spots`) that return joined data in one request. **Writes go
  straight to tables.**
- **Row Level Security is the security boundary.** The client is not trusted.
- Screens reload with `useFocusEffect` each time they come into view, so
  data is never stale after navigating back.
- Chat uses Supabase Realtime for new messages, read receipts and typing
  indicators.

### AI
The app calls Supabase Edge Functions (`generate-trail`, `generate-caption`),
never Groq or Gemini directly. Each function checks the user's login token
and a per-user hourly and daily limit (`consume_ai_quota`) before calling the
AI service. The API keys exist only as Supabase secrets. The trail generator
only sends real spots from the database to the model, and discards any stop
the model returns that doesn't match one of them.

---

## Project structure

```
wanderlens/
├── app/                      # Routes: one screen per file
│   ├── _layout.tsx           # Fonts, providers, the four auth guards
│   ├── (auth)/               # login, signup, forgot-password
│   ├── (tabs)/               # Feed, Map, Connect, Chat, Profile
│   ├── spot/[id].tsx         # Spot detail
│   ├── user/[id].tsx         # Public profile
│   ├── chat/                 # Conversation screen, archived chats
│   ├── group/[id].tsx        # Group info and management
│   ├── add-spot.tsx          # New spot (GPS / search / tap-to-pin)
│   ├── spot-camera.tsx       # Geo-tag camera
│   ├── pick-location.tsx     # Tap-to-pin map
│   ├── trail-generator.tsx   # AI photo trail
│   ├── my-trails.tsx         # Saved trails
│   ├── photo-studio.tsx      # Photo styles
│   ├── notes.tsx, note-editor.tsx
│   ├── notifications.tsx, saved.tsx, onboarding.tsx, edit-profile.tsx, ...
├── components/               # Shared UI (chat/ and skeletons/ subfolders)
├── context/                  # Auth, Chat, Notifications, Tour providers
├── hooks/                    # useUserLocation, useGoldenHour, ...
├── lib/                      # Supabase client, AI, geocoding, helpers
├── store/                    # Zustand stores for screen-to-screen handoff
├── constants/                # theme.ts (design tokens), countries, tour steps
├── supabase/
│   ├── migrations/           # Schema changes since tracking began
│   └── functions/            # Edge Functions: generate-trail,
│                             #   generate-caption, delete-account
├── app.json, app.config.js   # Expo config (static + config plugins)
└── eas.json                  # EAS build profiles
```

Every code file begins with a comment explaining its purpose, and each
function and major block has a short explanation, so the code can be read
file by file.

---

## Development

```bash
npm start            # dev server for the installed development app
npm run android      # build and install the development app (Android)
npm run ios          # same for iOS (macOS only)
npm run lint         # ESLint (expo lint)
npx tsc --noEmit     # type check; lint does not catch type errors
```

There are no automated tests yet. A change counts as done when lint and the
type check pass and it has been checked by hand on a development build.
[`.claude/rules/testing.md`](.claude/rules/testing.md) has the manual
checklist. The type check currently reports three known errors in unused
Expo starter-template files (`components/ui/collapsible.tsx`,
`hooks/use-theme-color.ts`).

---

## License

MIT, see [LICENSE](LICENSE).

## Resources

- [Expo SDK 54 docs](https://docs.expo.dev/versions/v54.0.0/). This project
  targets this exact version.
- [Expo Router](https://docs.expo.dev/router/introduction/)
- [Supabase docs](https://supabase.com/docs)
- [MapLibre React Native](https://github.com/maplibre/maplibre-react-native)
