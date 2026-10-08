-- Wanderlens — security hardening (leftovers from the multi-photo and
-- explore reviews)
--
-- 1. spots.photo_url / styled_photo_url must point at a real file in the
--    owner's own folder of THIS project's spot-photos bucket. They were free
--    text: anyone calling the API directly could set their spot's cover to
--    any external URL, making every viewer's app fetch it (leaking IPs,
--    swappable content). spot_photos already avoids this by storing only a
--    path (20260939000000_spot_photos.sql).
-- 2. is_blocked(a, b) answered for ANY two users, so any signed-in user
--    could probe whether two other people had blocked each other.
--
-- Existing rows are not re-checked: the trigger only fires when a URL is
-- inserted or changed.

-- ------------------------------------------------------------------
-- Private settings: the project's own public storage base URL.
-- RLS on with no policies = unreadable through the API; only SECURITY
-- DEFINER functions read it.
-- ------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value text not null
);
alter table public.app_settings enable row level security;

-- Learn this project's base URL ("https://<ref>.supabase.co") from the cover
-- URLs already stored on spots (the most common one), instead of hard-coding
-- it. If there are no spots yet, nothing is stored and the check below falls
-- back to the path + file-exists rules alone.
insert into public.app_settings (key, value)
select 'storage_base_url', base
from (
  select substring(photo_url from '^(https://[^/]+)/storage/v1/object/public/spot-photos/') as base, count(*) as n
  from public.spots
  where photo_url is not null
  group by 1
) t
where base is not null
order by n desc
limit 1
on conflict (key) do nothing;

-- True when `url` is this project's public URL for an existing file in
-- `owner`'s own folder of the spot-photos bucket. NULL is allowed (a spot
-- without a styled copy).
create or replace function public.is_own_spot_photo_url(url text, owner uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, storage
as $$
declare
  v_base text;
  v_path text;
begin
  if url is null then
    return true;
  end if;
  if owner is null then
    return false;
  end if;

  v_path := substring(url from '^https://[^/]+/storage/v1/object/public/spot-photos/(.+)$');
  if v_path is null then
    return false;
  end if;

  select value into v_base from public.app_settings where key = 'storage_base_url';
  if v_base is not null and url <> v_base || '/storage/v1/object/public/spot-photos/' || v_path then
    return false;
  end if;

  -- The file is in the owner's folder and actually exists in this project.
  return split_part(v_path, '/', 1) = owner::text
    and exists (select 1 from storage.objects o where o.bucket_id = 'spot-photos' and o.name = v_path);
end;
$$;

-- Only the trigger below needs it.
revoke execute on function public.is_own_spot_photo_url(text, uuid) from public, anon, authenticated;

create or replace function public.check_spot_photo_urls()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_own_spot_photo_url(new.photo_url, new.created_by) then
    raise exception 'photo_url must be one of your own uploads' using errcode = '22023';
  end if;
  if not public.is_own_spot_photo_url(new.styled_photo_url, new.created_by) then
    raise exception 'styled_photo_url must be one of your own uploads' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists spots_check_photo_urls on public.spots;
create trigger spots_check_photo_urls
  before insert or update of photo_url, styled_photo_url, created_by on public.spots
  for each row execute function public.check_spot_photo_urls();

-- ------------------------------------------------------------------
-- 2. is_blocked: only answer about the caller
-- ------------------------------------------------------------------
-- Every existing caller passes the signed-in user (auth.uid()) or the row's
-- actor (new.user_id / new.sender_id, which RLS pins to auth.uid()) as one
-- side, so their behaviour is unchanged. A direct call about two OTHER
-- users now always answers false. With no auth.uid() (service role,
-- internal jobs) the full check still runs.
-- Same signature and return type, so create or replace is enough.
create or replace function public.is_blocked(p_user_a uuid, p_user_b uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select
    case
      when auth.uid() is not null and auth.uid() is distinct from p_user_a and auth.uid() is distinct from p_user_b
        then false
      else exists (
        select 1 from public.blocked_users
        where (blocker_id = p_user_a and blocked_id = p_user_b)
           or (blocker_id = p_user_b and blocked_id = p_user_a)
      )
    end;
$$;
