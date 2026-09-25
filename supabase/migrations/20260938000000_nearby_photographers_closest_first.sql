-- Wanderlens — nearby_photographers: closest first, skip deleted accounts
--
-- Replaces the baseline in 20260937000000_nearby_photographers_baseline.sql.
-- The function still means "people who have POSTED a spot within radius_km"
-- (profiles have no coordinates), but the old version picked its 10 results
-- with `limit 10` and no `order by`, so with more than 10 matches the strip
-- showed an arbitrary 10. Now each person is ranked by the distance to
-- their CLOSEST spot, nearest first.
--
-- Also filters out deleted (anonymized) accounts here via
-- profiles.deleted_at (20260928000000_account_deletion.sql). The app still
-- runs excludeDeletedProfiles as well; that's now redundant but harmless.
--
-- Same signature and RETURNS TABLE columns as before, so `create or replace`
-- works without `drop function` and the app needs no change to call it.
--
-- Parameters are referenced as nearby_photographers.lat / .long so they
-- can't be confused with a table column of the same name.

create or replace function public.nearby_photographers(lat double precision, long double precision, radius_km double precision default 30)
returns table(id uuid, username text, full_name text, avatar_url text, user_type text, photography_genres text[])
language sql
stable
as $function$
  with origin as (
    select ST_SetSRID(ST_MakePoint(nearby_photographers.long, nearby_photographers.lat), 4326)::geography as g
  ),
  -- One row per creator: the distance to their nearest spot in the radius.
  nearest as (
    select s.created_by, min(ST_Distance(s.location, o.g)) as dist_m
    from spots s, origin o
    where ST_DWithin(s.location, o.g, nearby_photographers.radius_km * 1000)
    group by s.created_by
  )
  select p.id, p.username, p.full_name, p.avatar_url, p.user_type, p.photography_genres
  from nearest n
  join profiles p on p.id = n.created_by
  where p.id != auth.uid()
    and p.deleted_at is null
  order by n.dist_m
  limit 10;
$function$;
