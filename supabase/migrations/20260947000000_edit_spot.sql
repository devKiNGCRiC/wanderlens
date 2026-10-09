-- Wanderlens — Edit Post
--
-- Owners can now edit a spot instead of deleting and re-posting it (which
-- threw away every like and comment): text, place name, a fine-tuned pin,
-- the photo set and cover, and the photo style.
--
-- Rules are enforced here, for every update path (the app or a direct API
-- call), not just in the edit screen:
--   * created_by can't change, and location can't be cleared;
--   * the pin can move at most 2 km from where the spot was first posted —
--     further than that is a different spot, and its likes/comments would
--     then describe a place they weren't about;
--   * edited_at is stamped whenever something people can see changes, so
--     Spot Detail can say "· edited".
-- Photo URLs keep being validated by spots_check_photo_urls
-- (20260941000000_security_hardening.sql).
--
-- Saving an edit is ONE call, save_spot_edit(), so the spot's fields and its
-- photo list change together or not at all.

-- ------------------------------------------------------------------
-- 1. Columns
-- ------------------------------------------------------------------
alter table public.spots
  add column if not exists edited_at timestamptz,
  -- The style settings behind styled_photo_url, so editing can re-apply the
  -- same style to a new cover. Null for spots styled before this existed.
  add column if not exists photo_style text,
  add column if not exists style_caption text,
  add column if not exists style_caption_font text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.spots'::regclass and conname = 'spots_style_text_lengths'
  ) then
    alter table public.spots add constraint spots_style_text_lengths check (
      coalesce(char_length(photo_style), 0) <= 40
      and coalesce(char_length(style_caption), 0) <= 80
      and coalesce(char_length(style_caption_font), 0) <= 40
    );
  end if;
end;
$$;

-- ------------------------------------------------------------------
-- 2. Where each spot was first posted — private
-- ------------------------------------------------------------------
-- Kept out of `spots` on purpose: spots is readable by every signed-in user,
-- and someone who nudged their pin away from, say, their home shouldn't
-- leave the original point readable. RLS is on with NO policies, so the API
-- can't read or write it; only the security-definer functions below can.
create table if not exists public.spot_origins (
  spot_id uuid primary key references public.spots(id) on delete cascade,
  location geography not null
);
alter table public.spot_origins enable row level security;

insert into public.spot_origins (spot_id, location)
select id, location from public.spots where location is not null
on conflict (spot_id) do nothing;

create or replace function public.record_spot_origin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.location is not null then
    insert into spot_origins (spot_id, location) values (new.id, new.location)
    on conflict (spot_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists spots_record_origin on public.spots;
create trigger spots_record_origin
  after insert on public.spots
  for each row execute function public.record_spot_origin();

-- The owner's own origin, for the edit screen's 2 km limit on the map.
create or replace function public.get_spot_origin(p_spot_id uuid)
returns table (lat double precision, lng double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select ST_Y(o.location::geometry), ST_X(o.location::geometry)
  from spot_origins o
  join spots s on s.id = o.spot_id
  where o.spot_id = p_spot_id and s.created_by = auth.uid();
$$;
revoke execute on function public.get_spot_origin(uuid) from public, anon;
grant execute on function public.get_spot_origin(uuid) to authenticated;

-- ------------------------------------------------------------------
-- 3. Guard trigger
-- ------------------------------------------------------------------
-- SECURITY DEFINER only to read spot_origins; it changes nothing but NEW.
create or replace function public.guard_spot_edit()
returns trigger
language plpgsql
security definer
-- `extensions` for PostGIS on newer Supabase projects (see explore_spots).
set search_path = public, extensions
as $$
declare
  v_origin geography;
begin
  if tg_op = 'INSERT' then
    new.edited_at := null;
    return new;
  end if;

  if new.created_by is distinct from old.created_by then
    raise exception 'a spot''s owner can''t be changed' using errcode = '42501';
  end if;

  if new.location is distinct from old.location then
    if new.location is null then
      raise exception 'a spot needs a location' using errcode = '22023';
    end if;
    select location into v_origin from spot_origins where spot_id = old.id;
    v_origin := coalesce(v_origin, old.location);
    if v_origin is not null and ST_Distance(new.location, v_origin) > 2000 then
      raise exception 'A spot can only be moved up to 2 km from where it was first posted.' using errcode = '22023';
    end if;
  end if;

  if (new.title, new.description, new.best_time, new.genre, new.time_of_day,
      new.place_name, new.place_locality, new.place_district, new.place_state,
      new.place_country, new.place_postcode, new.location_label,
      new.photo_url, new.styled_photo_url, new.photo_style, new.style_caption, new.style_caption_font)
     is distinct from
     (old.title, old.description, old.best_time, old.genre, old.time_of_day,
      old.place_name, old.place_locality, old.place_district, old.place_state,
      old.place_country, old.place_postcode, old.location_label,
      old.photo_url, old.styled_photo_url, old.photo_style, old.style_caption, old.style_caption_font)
     or new.location is distinct from old.location then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;

drop trigger if exists spots_guard_edit on public.spots;
create trigger spots_guard_edit
  before insert or update on public.spots
  for each row execute function public.guard_spot_edit();

-- ------------------------------------------------------------------
-- 4. Save an edit atomically
-- ------------------------------------------------------------------
-- p_fields: the spot's editable columns (see lib/spotSave.ts sharedColumns),
--   with `location` as EWKT text, plus photo_url / styled_photo_url.
-- p_photos: ordered JSON array of { storage_path, width, height }; the first
--   is the cover.
-- SECURITY INVOKER: the caller's own RLS applies (owner-only updates on
-- spots; owner-only spot_photos inserts from their own folder). The row lock
-- serialises two devices saving the same spot. Everything here is one
-- transaction: a failure anywhere leaves the spot exactly as it was.
-- Returns the storage paths of photos no longer used, for the client to
-- delete from the bucket afterwards.
create or replace function public.save_spot_edit(p_spot_id uuid, p_fields jsonb, p_photos jsonb)
returns text[]
language plpgsql
set search_path = public, extensions
as $$
declare
  v_count int;
  v_old text[];
  v_new text[];
begin
  perform 1 from spots where id = p_spot_id and created_by = auth.uid() for update;
  if auth.uid() is null or not found then
    raise exception 'only the spot''s owner can edit it' using errcode = '42501';
  end if;

  v_count := coalesce(jsonb_array_length(p_photos), 0);
  if v_count < 1 or v_count > 10 then
    raise exception 'a spot needs between 1 and 10 photos' using errcode = '22023';
  end if;

  update spots set
    title = p_fields->>'title',
    description = p_fields->>'description',
    best_time = p_fields->>'best_time',
    genre = p_fields->>'genre',
    time_of_day = p_fields->>'time_of_day',
    location = (p_fields->>'location')::geography,
    place_name = p_fields->>'place_name',
    place_locality = p_fields->>'place_locality',
    place_district = p_fields->>'place_district',
    place_state = p_fields->>'place_state',
    place_country = p_fields->>'place_country',
    place_postcode = p_fields->>'place_postcode',
    location_label = p_fields->>'location_label',
    photo_style = p_fields->>'photo_style',
    style_caption = p_fields->>'style_caption',
    style_caption_font = p_fields->>'style_caption_font',
    photo_url = p_fields->>'photo_url',
    styled_photo_url = p_fields->>'styled_photo_url'
  where id = p_spot_id;

  select coalesce(array_agg(storage_path), '{}') into v_old from spot_photos where spot_id = p_spot_id;
  select array_agg(e->>'storage_path') into v_new from jsonb_array_elements(p_photos) e;

  -- Positions are unique per spot, so reorder by replacing the whole list.
  delete from spot_photos where spot_id = p_spot_id;
  insert into spot_photos (spot_id, storage_path, position, width, height)
  select p_spot_id, e->>'storage_path', (ord - 1)::smallint, (e->>'width')::int, (e->>'height')::int
  from jsonb_array_elements(p_photos) with ordinality as t(e, ord);

  return array(select unnest(v_old) except select unnest(v_new));
end;
$$;

revoke execute on function public.save_spot_edit(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_spot_edit(uuid, jsonb, jsonb) to authenticated;
