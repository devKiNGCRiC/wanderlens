-- Wanderlens — community data readable by signed-in users only
--
-- profiles, spots, spot_likes, spot_comments and comment_likes were
-- readable by the `public` role, which includes anon. The anon key ships in
-- every APK, so anyone could download every profile — including trip
-- destinations and dates (when someone is away from home) and home city —
-- plus every spot's exact capture coordinates, without an account.
--
-- The app never reads these tables signed out except for one thing: the
-- signup screen's "is this username taken?" check. That now goes through
-- is_username_available() below, which answers yes/no without exposing any
-- row. Every other read happens after login, so nothing in the app changes.
--
-- Writes are untouched. The public storage buckets (spot-photos,
-- profile-media) stay public-read: their file names are random-ish and the
-- images are what the app shows anyway.

-- ------------------------------------------------------------------
-- 1. Username check for signup (callable signed out)
-- ------------------------------------------------------------------
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Same normalisation the signup screen applies (trim + lower case).
  -- Names under 3 characters are never "available" (the screen doesn't check them).
  select char_length(trim(p_username)) >= 3
    and not exists (select 1 from profiles where username = lower(trim(p_username)));
$$;

revoke execute on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- ------------------------------------------------------------------
-- 2. Replace the "viewable by everyone" read policies
-- ------------------------------------------------------------------
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
drop policy if exists "signed-in users can read profiles" on public.profiles;
create policy "signed-in users can read profiles"
  on public.profiles for select to authenticated using (true);

drop policy if exists "Spots are viewable by everyone" on public.spots;
drop policy if exists "signed-in users can read spots" on public.spots;
create policy "signed-in users can read spots"
  on public.spots for select to authenticated using (true);

-- spot_likes / spot_comments already have a signed-in read policy
-- (20260940000000_explore_and_likers.sql); only the public one goes.
drop policy if exists "Likes are viewable by everyone" on public.spot_likes;
drop policy if exists "Comments are viewable by everyone" on public.spot_comments;

drop policy if exists "Comment likes are viewable by everyone" on public.comment_likes;
drop policy if exists "signed-in users can read comment likes" on public.comment_likes;
create policy "signed-in users can read comment likes"
  on public.comment_likes for select to authenticated using (true);
