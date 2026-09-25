-- Wanderlens — nearby_photographers: baseline of the live definition
--
-- This RPC was created by hand in the Supabase dashboard before migrations
-- were tracked, so its SQL was never in the repo. This file records the
-- live definition exactly as `pg_get_functiondef` returned it on
-- 2026-09-25, so future changes start from real code instead of guesses.
-- Running it against the live database is a no-op (same signature, same
-- body).
--
-- What it returns (used by the Feed tab's "Photographers nearby" strip,
-- app/(tabs)/index.tsx): people who have POSTED at least one spot within
-- radius_km of the given point. It does not know where users are: profiles
-- have no coordinates, only spots do. So "nearby photographer" means "has
-- shot near here", not "is near here now".
--
-- Details worth knowing before changing it:
-- - The caller (auth.uid()) is excluded.
-- - `distinct` lists each person once, however many nearby spots they have.
-- - `limit 10` has no `order by`, so with more than 10 matches the 10
--   returned are arbitrary (not the closest or most recent).
-- - Deleted accounts (profiles.deleted_at) are NOT filtered here; the app
--   drops them afterwards with excludeDeletedProfiles (lib/profiles.ts).
-- - Changing the RETURNS TABLE columns needs `drop function` first
--   (see .claude/rules/supabase.md).

CREATE OR REPLACE FUNCTION public.nearby_photographers(lat double precision, long double precision, radius_km double precision DEFAULT 30)
 RETURNS TABLE(id uuid, username text, full_name text, avatar_url text, user_type text, photography_genres text[])
 LANGUAGE sql
 STABLE
AS $function$
  select distinct p.id, p.username, p.full_name, p.avatar_url, p.user_type, p.photography_genres
  from profiles p
  join spots s on s.created_by = p.id
  where p.id != auth.uid()
    and ST_DWithin(s.location, ST_SetSRID(ST_MakePoint(long, lat), 4326)::geography, radius_km * 1000)
  limit 10;
$function$;
