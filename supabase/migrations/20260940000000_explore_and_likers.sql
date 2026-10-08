-- Wanderlens — "Liked by" list and Feed sorting
--
-- Two new, tracked RPCs. The legacy feed_spots RPC (untracked) is left
-- untouched; the Feed simply stops calling it.
--
-- Both are SECURITY INVOKER (the default): the caller's own RLS on spots,
-- spot_likes, spot_comments and profiles still decides what's visible.
-- Blocks (both directions) come from my_blocked_ids() below, computed once
-- per call. Both are signed-in only.

-- spot_likes predates migration tracking; make sure it has a timestamp for
-- "liked 2h ago" and latest-first ordering. Existing rows get the time this
-- runs, which is the best that can be known.
alter table public.spot_likes add column if not exists created_at timestamptz not null default now();

-- Indexes the per-spot counts below lean on (no-ops if they already exist).
create index if not exists spot_likes_spot_id_idx on public.spot_likes (spot_id);
create index if not exists spot_comments_spot_id_idx on public.spot_comments (spot_id);

-- Product decision: any signed-in user can see who liked a spot and every
-- comment on it (Instagram-style; Spot Detail already counts all likes).
-- The live policies predate migration tracking, so state the read rule here
-- explicitly. Policies are permissive (OR-ed), so this only ever widens a
-- stricter existing policy to the intended rule; writes are unaffected.
drop policy if exists "signed-in users can read spot likes" on public.spot_likes;
create policy "signed-in users can read spot likes"
  on public.spot_likes for select to authenticated using (true);
drop policy if exists "signed-in users can read spot comments" on public.spot_comments;
create policy "signed-in users can read spot comments"
  on public.spot_comments for select to authenticated using (true);

-- The caller's blocks, both directions, as one array — computed once per
-- call instead of calling is_blocked() per row. SECURITY DEFINER because
-- blocked_users RLS only shows a user the rows where they are the blocker,
-- and only ever about the caller (auth.uid()), never an arbitrary user.
create or replace function public.my_blocked_ids()
returns uuid[]
language sql security definer set search_path = public stable
as $$
  select coalesce(array_agg(distinct x), '{}')
  from (
    select blocked_id as x from blocked_users where blocker_id = auth.uid()
    union
    select blocker_id from blocked_users where blocked_id = auth.uid()
  ) b;
$$;
revoke execute on function public.my_blocked_ids() from public, anon;
grant execute on function public.my_blocked_ids() to authenticated;

-- ------------------------------------------------------------------
-- 1. Who liked a spot
-- ------------------------------------------------------------------
create or replace function public.get_spot_likers(p_spot_id uuid, p_limit int default 50, p_offset int default 0)
returns table (user_id uuid, username text, full_name text, avatar_url text, user_type text, liked_at timestamptz)
language sql
stable
set search_path = public
as $$
  select p.id, p.username::text, p.full_name::text, p.avatar_url::text, p.user_type::text, l.created_at
  from spot_likes l
  join profiles p on p.id = l.user_id
  where auth.uid() is not null
    and l.spot_id = p_spot_id
    and p.deleted_at is null
    and p.id <> all(public.my_blocked_ids())
  order by l.created_at desc nulls last, p.id
  -- Capped so a caller can't ask for an unbounded page.
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

-- Signed-in only: new functions are executable by PUBLIC/anon by default.
revoke execute on function public.get_spot_likers(uuid, int, int) from public, anon;
grant execute on function public.get_spot_likers(uuid, int, int) to authenticated;

-- ------------------------------------------------------------------
-- 2. Sorted Feed
-- ------------------------------------------------------------------
-- p_sort:   'recent' | 'nearby' | 'liked' | 'discussed' | 'for_you'
-- p_window: 'week' | 'month' | 'all' — applies to 'liked' and 'discussed' only
-- p_genre / p_time: optional filters, same values as feed_spots took
-- p_lat / p_lng: required for 'nearby' (no rows without them), ignored otherwise
--
-- 'for_you' is a transparent rule-based score from the app's own data —
-- deliberately not AI (see CLAUDE.md, "the thesis"):
--     3 × genre is one of my photography_genres
--   + 4 × creator is an accepted connection of mine
--   + ln(1 + likes + 2 × comments)          popularity, damped
--   + 5 × exp(-age_days / 7)                freshness
-- My own posts are excluded from it.
create or replace function public.explore_spots(
  p_sort text default 'recent',
  p_genre text default null,
  p_time text default null,
  p_window text default 'all',
  p_lat double precision default null,
  p_lng double precision default null,
  p_limit int default 30
)
returns table (
  id uuid, title text, genre text, photo_url text, created_by uuid,
  creator_username text, creator_name text, creator_avatar text, creator_deleted boolean,
  like_count int, comment_count int, created_at timestamptz, distance_m double precision
)
language plpgsql
stable
-- `extensions` too: on newer Supabase projects PostGIS (ST_*, geography)
-- lives there, and a path of only `public` would hide it.
set search_path = public, extensions
as $$
-- The OUT columns (id, title, created_at, …) share names with table columns;
-- every reference below is table-qualified, and this settles any leftover
-- ambiguity in favour of the column.
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_since timestamptz;
  v_origin geography;
  v_genres text[];
  v_blocked uuid[];
begin
  if v_me is null then
    raise exception 'explore_spots: sign in required' using errcode = '42501';
  end if;
  if p_sort is null or p_sort not in ('recent', 'nearby', 'liked', 'discussed', 'for_you') then
    raise exception 'explore_spots: unknown sort %', p_sort using errcode = '22023';
  end if;
  if p_window is null or p_window not in ('week', 'month', 'all') then
    raise exception 'explore_spots: unknown window %', p_window using errcode = '22023';
  end if;

  if p_sort in ('liked', 'discussed') then
    v_since := case p_window when 'week' then now() - interval '7 days'
                             when 'month' then now() - interval '30 days'
                             else null end;
  end if;

  if p_sort = 'nearby' then
    if p_lat is null or p_lng is null then
      return;
    end if;
    v_origin := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  end if;

  v_blocked := public.my_blocked_ids();

  if p_sort = 'for_you' then
    select coalesce(pr.photography_genres, '{}') into v_genres from profiles pr where pr.id = v_me;
  end if;

  return query
  -- Counts are grouped over the whole likes/comments tables. Fine at this
  -- app's scale (indexed on spot_id above); if it grows large, switch the
  -- popularity sorts to trigger-maintained counter columns on spots.
  -- Counts include every like/comment, so a list can show "12 likes" while
  -- "Liked by" (which hides blocked/deleted people) lists fewer — accepted.
  with likes as (
    select l.spot_id, count(*)::int as n from spot_likes l group by l.spot_id
  ),
  comments as (
    select c.spot_id, count(*)::int as n from spot_comments c group by c.spot_id
  ),
  my_connections as (
    select case when cn.requester_id = v_me then cn.recipient_id else cn.requester_id end as other_id
    from connections cn
    where cn.status = 'accepted' and (cn.requester_id = v_me or cn.recipient_id = v_me)
  ),
  base as (
    select
      s.id, s.title, s.genre::text as genre, s.photo_url, s.created_by,
      p.username, p.full_name, p.avatar_url, (p.deleted_at is not null) as is_deleted,
      coalesce(lk.n, 0) as likes_n, coalesce(cm.n, 0) as comments_n, s.created_at,
      case when v_origin is not null then ST_Distance(s.location, v_origin) end as dist,
      (s.created_by in (select other_id from my_connections)) as from_connection
    from spots s
    left join profiles p on p.id = s.created_by
    left join likes lk on lk.spot_id = s.id
    left join comments cm on cm.spot_id = s.id
    where (p_genre is null or s.genre = p_genre)
      and (p_time is null or s.time_of_day = p_time)
      and (v_since is null or s.created_at >= v_since)
      and (v_origin is null or ST_DWithin(s.location, v_origin, 100000))
      and (s.created_by is null or s.created_by <> all(v_blocked))
      and (p_sort <> 'for_you' or s.created_by is distinct from v_me)
  )
  -- ::text casts: RETURN QUERY needs exact type matches, and these legacy
  -- columns' declared types (text vs varchar) aren't visible in the repo.
  select
    b.id, b.title::text, b.genre, b.photo_url::text, b.created_by,
    b.username::text, b.full_name::text, b.avatar_url::text, coalesce(b.is_deleted, false),
    b.likes_n, b.comments_n, b.created_at, b.dist
  from base b
  order by
    case when p_sort = 'nearby' then b.dist end asc nulls last,
    case when p_sort = 'liked' then b.likes_n end desc nulls last,
    case when p_sort = 'discussed' then b.comments_n end desc nulls last,
    case when p_sort = 'for_you' then
        3 * (case when b.genre = any(v_genres) then 1 else 0 end)
      + 4 * (case when b.from_connection then 1 else 0 end)
      + ln(1 + b.likes_n + 2 * b.comments_n)
      + 5 * exp(-extract(epoch from (now() - b.created_at)) / 86400.0 / 7)
    end desc nulls last,
    b.created_at desc
  limit least(greatest(p_limit, 1), 50);
end;
$$;

revoke execute on function public.explore_spots(text, text, text, text, double precision, double precision, int) from public, anon;
grant execute on function public.explore_spots(text, text, text, text, double precision, double precision, int) to authenticated;
