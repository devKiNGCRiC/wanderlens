# TypeScript conventions

`strict: true` is on. `@/*` aliases the repo root, so import as
`@/lib/supabase`, `@/constants/theme` — never `../../lib/supabase`.

## Types

- `type` aliases, not `interface`, unless you need declaration merging. The
  codebase uses `type` throughout.
- Declare row shapes next to the screen that consumes them (see the `NearbySpot`,
  `Photographer`, `FeedPost` types in `app/(tabs)/index.tsx`). Promote a type to a
  shared location only when a third file needs it.
- Supabase columns are nullable far more often than they look. Model them as
  `string | null`, not `string`, and handle the null at the render site.

## `any`

`lib/ai.ts` and a couple of screens use `any` at boundaries where JSON arrives
untyped. That's tolerated at the parse boundary — but type the value as soon as
it crosses into app code. Don't spread `any` inward, and don't add new `any` in
component props.

## Verifying

`npm run lint` runs `expo lint` (ESLint with `eslint-config-expo`). For type
errors specifically, run `npx tsc --noEmit` — lint alone will not catch them.

## Known exception

`lib/supabase.js` is JavaScript. Converting it to `.ts` is welcome; until then,
don't assume the exported client is typed against your database schema.
