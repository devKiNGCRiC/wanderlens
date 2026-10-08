-- Wanderlens — bring a live spot_photos table in line with
-- 20260939000000_spot_photos.sql
--
-- An early draft of that migration created spot_photos with a NOT NULL
-- photo_url column and no constraints on storage_path. The final version
-- dropped photo_url (the app derives the URL from storage_path, so a
-- client-supplied URL can't point viewers at an arbitrary host), but
-- `create table if not exists` leaves an already-created table untouched.
-- Result: every post failed with "null value in column photo_url".
--
-- Idempotent: safe whether the table came from the draft or the final file.

alter table public.spot_photos drop column if exists photo_url;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.spot_photos'::regclass and conname = 'spot_photos_storage_path_key'
  ) then
    alter table public.spot_photos add constraint spot_photos_storage_path_key unique (storage_path);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.spot_photos'::regclass and conname = 'spot_photos_storage_path_check'
  ) then
    alter table public.spot_photos add constraint spot_photos_storage_path_check
      check (storage_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_.-]+\.jpg$');
  end if;
end;
$$;
