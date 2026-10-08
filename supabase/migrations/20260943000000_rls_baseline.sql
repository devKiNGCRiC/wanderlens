-- Wanderlens — baseline of the pre-migration RLS policies, plus one fix
--
-- These policies were created in the dashboard before this repo tracked
-- migrations, so the repo didn't show the app's real security rules. Each is
-- recreated here exactly as it exists live (from pg_policies, 2026-10-09),
-- so running this changes nothing except the fix in part 3. Policies added
-- by later migrations (chat, notifications, comment edit/delete, spot_photos,
-- explore) are already tracked in their own files and aren't repeated.
--
-- Roles "{public}" means the policy applies to every role, including anon:
-- spots, profiles, likes and comments are publicly readable by design today.

-- ------------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------------

-- profiles
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone" on public.profiles
  for select using (true);
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);

-- spots
drop policy if exists "Spots are viewable by everyone" on public.spots;
create policy "Spots are viewable by everyone" on public.spots
  for select using (true);
drop policy if exists "Authenticated users can add spots" on public.spots;
create policy "Authenticated users can add spots" on public.spots
  for insert with check (auth.uid() = created_by);
drop policy if exists "Users can update their own spots" on public.spots;
create policy "Users can update their own spots" on public.spots
  for update using (auth.uid() = created_by);
drop policy if exists "Users can delete their own spots" on public.spots;
create policy "Users can delete their own spots" on public.spots
  for delete using (auth.uid() = created_by);

-- spot_likes
drop policy if exists "Likes are viewable by everyone" on public.spot_likes;
create policy "Likes are viewable by everyone" on public.spot_likes
  for select using (true);
drop policy if exists "Users can like spots" on public.spot_likes;
create policy "Users can like spots" on public.spot_likes
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users can unlike their own likes" on public.spot_likes;
create policy "Users can unlike their own likes" on public.spot_likes
  for delete using (auth.uid() = user_id);

-- spot_comments (update and owner-delete live in 20260923000000)
drop policy if exists "Comments are viewable by everyone" on public.spot_comments;
create policy "Comments are viewable by everyone" on public.spot_comments
  for select using (true);
drop policy if exists "Users can add comments" on public.spot_comments;
create policy "Users can add comments" on public.spot_comments
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users can delete their own comments" on public.spot_comments;
create policy "Users can delete their own comments" on public.spot_comments
  for delete using (auth.uid() = user_id);

-- comment_likes
drop policy if exists "Comment likes are viewable by everyone" on public.comment_likes;
create policy "Comment likes are viewable by everyone" on public.comment_likes
  for select using (true);
drop policy if exists "Users can like comments" on public.comment_likes;
create policy "Users can like comments" on public.comment_likes
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users can unlike their own likes" on public.comment_likes;
create policy "Users can unlike their own likes" on public.comment_likes
  for delete using (auth.uid() = user_id);

-- saved_spots (private to the saver)
drop policy if exists "Users can view their own saved spots" on public.saved_spots;
create policy "Users can view their own saved spots" on public.saved_spots
  for select using (auth.uid() = user_id);
drop policy if exists "Users can save spots" on public.saved_spots;
create policy "Users can save spots" on public.saved_spots
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users can unsave their own saves" on public.saved_spots;
create policy "Users can unsave their own saves" on public.saved_spots
  for delete using (auth.uid() = user_id);

-- trails (private to the owner)
drop policy if exists "Users can view their own trails" on public.trails;
create policy "Users can view their own trails" on public.trails
  for select using (auth.uid() = user_id);
drop policy if exists "Users can save trails" on public.trails;
create policy "Users can save trails" on public.trails
  for insert with check (auth.uid() = user_id);
drop policy if exists "Users can delete their own trails" on public.trails;
create policy "Users can delete their own trails" on public.trails
  for delete using (auth.uid() = user_id);

-- connections (visible only to the two people involved)
drop policy if exists "Users can view their own connections" on public.connections;
create policy "Users can view their own connections" on public.connections
  for select using ((auth.uid() = requester_id) or (auth.uid() = recipient_id));
drop policy if exists "Users can send connection requests" on public.connections;
create policy "Users can send connection requests" on public.connections
  for insert with check (auth.uid() = requester_id);
drop policy if exists "Recipients can respond to requests" on public.connections;
create policy "Recipients can respond to requests" on public.connections
  for update using (auth.uid() = recipient_id);
drop policy if exists "Users can remove their own connections" on public.connections;
create policy "Users can remove their own connections" on public.connections
  for delete using ((auth.uid() = requester_id) or (auth.uid() = recipient_id));

-- ------------------------------------------------------------------
-- 2. Storage (spot-photos, profile-media). The chat buckets
--    (message-media, group-media) and the spot-photos delete policy are
--    tracked in the chat and spot_photos migrations.
-- ------------------------------------------------------------------
drop policy if exists "Spot photos are publicly viewable" on storage.objects;
create policy "Spot photos are publicly viewable" on storage.objects
  for select using (bucket_id = 'spot-photos');
drop policy if exists "Authenticated users can upload spot photos" on storage.objects;
create policy "Authenticated users can upload spot photos" on storage.objects
  for insert with check (bucket_id = 'spot-photos' and (auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "Profile media is publicly viewable" on storage.objects;
create policy "Profile media is publicly viewable" on storage.objects
  for select using (bucket_id = 'profile-media');
drop policy if exists "Users can upload their own profile media" on storage.objects;
create policy "Users can upload their own profile media" on storage.objects
  for insert with check (bucket_id = 'profile-media' and (auth.uid())::text = (storage.foldername(name))[1]);
drop policy if exists "Users can update their own profile media" on storage.objects;
create policy "Users can update their own profile media" on storage.objects
  for update using (bucket_id = 'profile-media' and (auth.uid())::text = (storage.foldername(name))[1]);

-- ------------------------------------------------------------------
-- 3. Fix: a recipient could forge a connection
-- ------------------------------------------------------------------
-- "Recipients can respond to requests" lets the recipient update the WHOLE
-- row. Its USING clause doubles as the WITH CHECK, which only requires the
-- recipient to stay the same — so a recipient could rewrite requester_id
-- to anyone and set status 'accepted', creating a "mutual" connection the
-- other person never agreed to. That breaks the app's core rule
-- (connections are both-sides-agreed).
--
-- The app only ever does `update({ status: 'accepted' })` on a pending
-- request, so the trigger allows exactly that (and 'declined'), nothing else.
create or replace function public.guard_connection_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.requester_id is distinct from old.requester_id
     or new.recipient_id is distinct from old.recipient_id then
    raise exception 'a connection''s people can''t be changed' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if old.status <> 'pending' or new.status not in ('accepted', 'declined') then
      raise exception 'a request can only be accepted or declined while pending' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists connections_guard_update on public.connections;
create trigger connections_guard_update
  before update on public.connections
  for each row execute function public.guard_connection_update();
