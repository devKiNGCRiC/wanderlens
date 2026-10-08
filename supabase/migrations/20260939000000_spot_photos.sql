-- Wanderlens — multi-photo spots
--
-- A spot can now carry 1–10 photos. Every photo, including the hero, is a
-- row here; position 0 is the hero. spots.photo_url keeps holding the hero
-- URL too, so every existing reader of it (map pins, clustering,
-- nearby_spots, feed_spots, get_spot, saved, chat spot-share, the trail
-- generator) keeps working unchanged. feed_spots and get_spot are legacy,
-- untracked RPCs, so the client reads this table alongside them rather than
-- having their return columns changed blind.
--
-- Spots posted before this migration have no rows here; the client falls
-- back to spots.photo_url for them, so no backfill is needed.
--
-- No update policy: Edit Post is deliberately deferred (delete-and-recreate).

create table if not exists public.spot_photos (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references public.spots(id) on delete cascade,
  -- Object key in the spot-photos bucket ("<uid>/<ts>_<n>.jpg"). The client
  -- derives the public URL from it, deliberately: a stored, client-supplied
  -- URL could point every viewer's app at an arbitrary external host.
  -- Unique so two spots can't share (and later delete) one file.
  storage_path text not null unique
    check (storage_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_.-]+\.jpg$'),
  -- The 0..9 range plus the unique constraint caps a spot at 10 photos
  -- server-side, whatever the client sends.
  position smallint not null check (position between 0 and 9),
  width int not null check (width > 0),
  height int not null check (height > 0),
  created_at timestamptz not null default now(),
  unique (spot_id, position)
);

create index if not exists spot_photos_spot_id_idx on public.spot_photos (spot_id);

alter table public.spot_photos enable row level security;

-- Visible whenever the parent spot is visible: the subquery runs under the
-- caller's RLS on spots, so this inherits whatever rule spots already has.
drop policy if exists "spot photos visible with their spot" on public.spot_photos;
create policy "spot photos visible with their spot"
  on public.spot_photos for select
  to authenticated
  using (exists (select 1 from public.spots s where s.id = spot_id));

-- Only the spot's creator can attach photos, and only files from their own
-- storage folder (so a row can't point at, and later delete, someone else's file).
drop policy if exists "spot owner can add photos" on public.spot_photos;
create policy "spot owner can add photos"
  on public.spot_photos for insert
  to authenticated
  with check (
    exists (select 1 from public.spots s where s.id = spot_id and s.created_by = auth.uid())
    and storage_path like auth.uid()::text || '/%'
  );

drop policy if exists "spot owner can remove photos" on public.spot_photos;
create policy "spot owner can remove photos"
  on public.spot_photos for delete
  to authenticated
  using (exists (select 1 from public.spots s where s.id = spot_id and s.created_by = auth.uid()));

-- Storage: let a user delete files in their own spot-photos folder, so a
-- failed post and a deleted spot can clean up after themselves. The bucket's
-- existing select/insert policies predate this repo's migrations and are
-- left untouched.
drop policy if exists "spot-photos owner can delete own files" on storage.objects;
create policy "spot-photos owner can delete own files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'spot-photos' and (storage.foldername(name))[1] = auth.uid()::text);
