-- Wanderlens — geo-tag camera: named capture location
--
-- Adds a human-readable place name (e.g. "Marina Beach") alongside the raw
-- capture_lat/capture_lng added in 20260933000000_spot_geo_tag.sql,
-- resolved via Nominatim reverse geocoding (lib/geocoding.ts) at capture
-- time. Nullable — Nominatim may have no named feature for the coordinates,
-- or the reverse-geocode request may simply fail; the camera capture never
-- blocks on it.

alter table public.spots add column if not exists capture_place_name text;
