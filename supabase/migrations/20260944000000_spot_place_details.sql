-- Wanderlens — a spot's own place name and structured address
--
-- The location label used to come from the phone's geocoder at city level,
-- so a specific pass, lake or monastery was saved as the nearest town
-- ("Tawang, Arunachal Pradesh, India"), and in "From another trip" mode the
-- name the user typed was thrown away. Now the user names the place
-- themselves, and the address parts are stored separately so Spot Detail
-- can show locality / state / country / PIN code under that name.
--
-- All nullable: spots posted before this keep only location_label, which
-- is still written (composed from these) for every older reader — map
-- card, chat spot-shares, trail generator.

alter table public.spots
  add column if not exists place_name text,
  add column if not exists place_locality text,
  add column if not exists place_district text,
  add column if not exists place_state text,
  add column if not exists place_country text,
  add column if not exists place_postcode text;

-- Keep free text bounded (the app caps the name at 80 characters too).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.spots'::regclass and conname = 'spots_place_text_lengths'
  ) then
    alter table public.spots add constraint spots_place_text_lengths check (
      coalesce(char_length(place_name), 0) <= 80
      and coalesce(char_length(place_locality), 0) <= 120
      and coalesce(char_length(place_district), 0) <= 120
      and coalesce(char_length(place_state), 0) <= 120
      and coalesce(char_length(place_country), 0) <= 120
      and coalesce(char_length(place_postcode), 0) <= 20
    );
  end if;
end;
$$;
