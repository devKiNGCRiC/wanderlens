-- Wanderlens — multi-destination trips
--
-- A trip can span more than one place (a multi-city itinerary), and the
-- prior single-text `trip_destination` couldn't represent that. Switches to
-- an array, matching the existing `photography_genres`/`place_interests`
-- pattern (text[] + chip picker), and moves matching from a loose ILIKE
-- substring check to an exact array-overlap check — array elements are now
-- stored trimmed + lowercased on save, so the overlap check stays
-- case-insensitive without needing a separate normalized column. This is a
-- deliberate interim step: real spelling/format consistency (e.g. "Paris"
-- vs "Paris, France" vs "paris fr") is a follow-up (place autocomplete),
-- not solved here.

alter table public.profiles add column if not exists trip_destinations text[];
update public.profiles set trip_destinations = array[lower(trim(trip_destination))]
  where trip_destination is not null and trip_destinations is null;
alter table public.profiles drop column if exists trip_destination;
