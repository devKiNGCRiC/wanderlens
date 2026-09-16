-- Wanderlens — geo-tag camera: full address
--
-- capture_place_name (added in 20260934000000) holds a specific named
-- feature when Nominatim has one (e.g. "Marina Beach"), which used to
-- silently replace the full formatted address when present. This column
-- holds that full address independently, so a landmark name and its street
-- address can both be shown rather than one crowding out the other.

alter table public.spots add column if not exists capture_address text;
