---
name: new-feature
description: End-to-end workflow for building a Wanderlens feature that spans database, screens, and UI — plan first, then schema and RLS, then data layer, then UI, then review. Use for any change touching more than one screen or needing new data.
---

# Building a feature

For anything spanning multiple screens or requiring new data. For a single
screen, use `new-screen` instead.

## 1. Plan before editing

Enter plan mode. Produce, and get agreement on:

- What the user can do that they couldn't before
- Which screens change and which are new
- What data is needed — new columns, tables, or RPCs
- Whether existing RPCs already cover the reads
- What could break: auth guards, the feed query, RLS

Do not write code until the user approves the plan.

## 2. Database first

If new data is needed, settle the schema before any UI:

- Table shape, and which columns are genuinely nullable
- **The RLS policy — written in the same change, never deferred.** State who can
  select, insert, update, delete, and on what condition.
- Whether reads need a new RPC. If a screen would otherwise do a join or an N+1
  fetch, it does.

Existing RPCs: `feed_spots`, `nearby_spots`, `nearby_photographers`,
`discover_people`, `get_spot`, `get_spot_comments`, `get_saved_spots`,
`get_connection_status`. Extending one usually beats adding another.

Migrations are applied by the user in Supabase — hand them the SQL, state that
it needs to run, and don't assume it has.

## 3. Data layer

Pure helpers go in `lib/`. No React, no JSX there. Types for new row shapes
live next to the screen that consumes them until a third file needs them.

## 4. UI

Follow `.claude/skills/new-screen/SKILL.md` for each screen. Build the shared
components in `components/` only once a second screen actually needs them.

All four states on every data surface.

## 5. Wire navigation

Register every new screen in the right `<Stack.Protected>` guard in
`app/_layout.tsx`. Check the entry points: which existing screen navigates here,
and does it pass the params this screen reads?

## 6. Review before declaring done

```bash
npm run lint
npx tsc --noEmit
```

Then run the relevant subagents — `react-native-reviewer`, `ui-reviewer`, and
`security-reviewer` if the feature touched data, auth, or keys.

## 7. Report honestly

Say what you verified and what you didn't. If a migration still needs running,
or the feature needs on-device testing, say that plainly rather than calling it
complete.
