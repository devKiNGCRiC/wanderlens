-- Wanderlens — optional styled (framed) photo per spot
--
-- photo_url stays the plain, edge-to-edge photo used everywhere today (feed,
-- map pin, profile/saved grids) — none of those surfaces respect an arbitrary
-- framed aspect ratio (the map pin is a 44x44 circular crop), so a decorated
-- photo shown there would be cropped unpredictably or double-framed against
-- the grids' own baked-in polaroid border.
--
-- styled_photo_url is a second, optional photo — populated only when the
-- user applies a style (polaroid/vintage/film retro) in add-spot — shown
-- only from the full-screen spot-detail viewer, the one surface that already
-- respects full aspect ratio (resizeMode="contain"). Nullable; existing rows
-- and any add-spot flow that skips styling are unaffected.

alter table public.spots add column if not exists styled_photo_url text;
