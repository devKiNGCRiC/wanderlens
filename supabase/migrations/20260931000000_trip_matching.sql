-- Wanderlens — travel-dates matching
--
-- Closes the one gap between the abstract's promised matching ("same
-- destination, same time window, or similar photography interest") and
-- what's built: destination/genre matching already existed, travel-dates
-- matching didn't. Scope is one upcoming trip per profile, not a multi-trip
-- planner — matches the abstract's framing and this project's scope.
--
-- All three nullable: most users won't have a trip set, and that's fine —
-- they simply don't appear in trip-matching queries.

alter table public.profiles
  add column if not exists trip_destination text,
  add column if not exists trip_start_date date,
  add column if not exists trip_end_date date;
