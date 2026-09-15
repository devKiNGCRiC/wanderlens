-- Wanderlens — geo-tag camera capture data
--
-- Backs the new in-app camera (app/spot-camera.tsx): GPS lat/lng/altitude,
-- capture timestamp, and weather/temperature at that place and time — a
-- verification signal distinct from `location`/`location_label`, which
-- remain the spot's overall map placement (can be GPS/search/tap-selected,
-- i.e. self-reported). All nullable: a photo picked from the library (not
-- a live capture) correctly has none of this, and even a live capture may
-- have some fields null (denied location permission, GPS/weather fetch
-- failure) without blocking the capture itself.

alter table public.spots
  add column if not exists capture_lat double precision,
  add column if not exists capture_lng double precision,
  add column if not exists capture_altitude double precision,
  add column if not exists captured_at timestamptz,
  add column if not exists weather_temp_c double precision,
  add column if not exists weather_condition text;
