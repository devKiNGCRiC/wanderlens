# Supabase rules

Client: `lib/supabase.js`. Session persists to `AsyncStorage`, auto-refreshes
while the app is foregrounded (`AppState` listener), `detectSessionInUrl: false`
because this is native.

## Schema in use

**Tables, with client code today:** `profiles`, `spots`, `spot_likes`,
`spot_comments`, `comment_likes`, `saved_spots`, `connections`, `trails`

**Chat feature (built):** `conversations`, `conversation_members`, `messages` —
see `.claude/rules/architecture.md` and the migrations under
`supabase/migrations/` for the full phase history (media types, groups,
search, etc.).

**`notifications`** — powers the in-app bell (`app/notifications.tsx`,
`context/NotificationsProvider.tsx`). `type` values in use: `connect_request`,
`connect_accepted` (populated by a pre-existing live trigger whose SQL
predates this repo's migration tracking — do not try to modify it blind) and,
as of `supabase/migrations/20260921000000_notifications_social_events.sql`,
`spot_like`, `spot_comment`, `comment_reply`, `comment_like`, `spot_shared`,
`message_request` (all populated by new triggers on `spot_likes`,
`spot_comments`, `comment_likes`, and `messages` respectively). The newer
types also populate `actor_id` (who did the action) and, for `comment_like`,
`related_comment_id` — the older connect-event rows leave both null.

**RPCs:** `feed_spots`, `nearby_spots`, `nearby_photographers`, `discover_people`,
`get_spot`, `get_spot_comments`, `get_saved_spots`, `get_connection_status`,
`get_notifications`, `get_unread_notification_count`, `mark_notifications_read`.
Also a `handle_new_user` trigger that auto-creates a `profiles` row on signup.

**Storage buckets:** `spot-photos`, `profile-media` — both public-read, insert
restricted to the authenticated owner's folder.

**PostGIS** backs the location queries (`nearby_spots`, `nearby_photographers`)
via a `geography` column on `spots`.

## Postgres gotcha already hit three times on this project

**Changing an RPC's return columns needs `drop function` before
`create or replace`** — Postgres won't allow an in-place return-type change.
When you edit an RPC signature, hand the user a migration that drops first.

## RLS self-reference recursion

The `conversations`/`conversation_members` policies hit Postgres's classic RLS
trap: a policy on `conversation_members` that queries `conversation_members` to
check membership recurses. The existing fix is a `security definer` helper
function that checks membership outside RLS. Follow that pattern for any new
policy that needs to check membership of the same table it's protecting —
don't write a self-referencing policy from scratch.

## The read/write split

Reads go through **RPCs**; writes go through **table calls**. Feed and detail
views need joined counts (likes, comments, creator profile) — doing that with
client-side queries means N+1 round trips over mobile network. When a screen
needs new joined data, extend or add an RPC rather than composing it in the
client.

## Rules

- Always destructure `{ data, error }` and handle `error`. A silently ignored
  error renders as a permanently empty screen.
- `.single()` throws when the row is missing. Use `.maybeSingle()` when absence
  is legitimate.
- Select named columns, not `*`, on list queries — mobile bandwidth is the
  constraint. (`AuthProvider` uses `*` for the profile; that one row is fine.)
- Never trust the client for authorization. **Row Level Security must enforce
  every rule**; a client-side filter is a UX affordance, not a control.
- New table → write the RLS policy in the same change. Never leave a table
  readable or writable by `anon` unless it is genuinely public.

## Auth

`context/AuthProvider.tsx` is the only place that talks to `supabase.auth` for
session state. It subscribes to `onAuthStateChange` and resolves `loading` from
inside that callback. Do not add a parallel `getSession()` call — the commented-out
block in that file is a previous attempt that caused a race, keep it that way.

Consume auth with `useAuth()`. Never read the session from storage directly.

## Storage

Uploads go through `base64-arraybuffer` (already a dependency) since RN lacks a
usable `Blob` path. Namespace object keys by user id. Resize or compress before
upload — full-resolution phone photos are multi-megabyte and users are on mobile
data.
