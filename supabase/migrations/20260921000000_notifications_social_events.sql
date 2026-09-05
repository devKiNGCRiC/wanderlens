-- Wanderlens — notifications for social events (likes, comments, replies,
-- comment likes, spot shares in chat, message requests).
--
-- Does NOT touch the pre-existing connection triggers that produce
-- 'connect_request' / 'connect_accepted' — their SQL predates this repo's
-- migration tracking and modifying an unknown live trigger blind is too
-- risky. Those rows keep actor_id = null; everything below is additive.
--
-- Every statement is idempotent and safe to re-run.

-- ============================================================
-- 1. Schema additions on the (untracked, live) notifications table
-- ============================================================

alter table public.notifications
  add column if not exists actor_id uuid references public.profiles(id) on delete cascade;

-- Identifies WHICH comment a comment_like refers to. related_id stays the
-- spot id (so a tap opens the spot); this gives the dedupe guard a real key
-- and lets a future client scroll to the comment. Cascades away with the
-- comment.
alter table public.notifications
  add column if not exists related_comment_id uuid references public.spot_comments(id) on delete cascade;

-- The live table predates migration tracking; the triggers below insert
-- without these columns, so pin the defaults rather than assume them.
alter table public.notifications alter column id set default gen_random_uuid();
alter table public.notifications alter column is_read set default false;
alter table public.notifications alter column created_at set default now();

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_actor_id_idx
  on public.notifications (actor_id);
create index if not exists notifications_dedupe_idx
  on public.notifications (user_id, type, related_id, actor_id, created_at desc);

-- Only adds the FK if the table is already clean — adding it unconditionally
-- would abort this whole migration if any orphan row exists.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'notifications_user_id_fkey' and conrelid = 'public.notifications'::regclass
  ) and not exists (
    select 1 from public.notifications n
    left join public.profiles p on p.id = n.user_id
    where n.user_id is not null and p.id is null
  ) then
    alter table public.notifications
      add constraint notifications_user_id_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
end $$;

-- ============================================================
-- 2. Helpers
-- ============================================================

-- Always returns a renderable name: username -> full_name -> 'Someone'.
-- Both columns are nullable and the profile row could theoretically be
-- missing entirely.
create or replace function public.notify_display_name(p_user_id uuid)
returns text
language sql security definer set search_path = public stable
as $$
  select coalesce(
    (select coalesce(nullif(trim(p.username), ''), nullif(trim(p.full_name), ''))
     from public.profiles p where p.id = p_user_id),
    'Someone'
  );
$$;

-- Toggle-spam guard. spot_likes / comment_likes are insert+delete pairs in
-- the client (not an upsert), so unlike+relike would otherwise emit a fresh
-- notification every time. Deliberately NOT used for comment notifications
-- (each comment is genuinely distinct content, never a duplicate event).
create or replace function public.notify_recent_duplicate(
  p_user_id     uuid,
  p_type        text,
  p_related_id  uuid,
  p_actor_id    uuid,
  p_comment_id  uuid,
  p_within      interval
)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.notifications n
    where n.user_id = p_user_id
      and n.type = p_type
      and n.related_id is not distinct from p_related_id
      and n.actor_id is not distinct from p_actor_id
      and n.related_comment_id is not distinct from p_comment_id
      and n.created_at > now() - p_within
  );
$$;

revoke execute on function public.notify_display_name(uuid) from public;
revoke execute on function public.notify_recent_duplicate(uuid, text, uuid, uuid, uuid, interval) from public;

-- ============================================================
-- 3. spot_likes -> spot owner
-- ============================================================

create or replace function public.notify_spot_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id   uuid;
  v_spot_title text;
begin
  -- The whole body is guarded, not just the insert — a lookup failure here
  -- must never roll back the like itself any more than an insert failure
  -- should.
  begin
    select s.created_by, s.title into v_owner_id, v_spot_title
    from public.spots s
    where s.id = new.spot_id;

    -- `is not null and <>`, never `is distinct from` — created_by is
    -- nullable, and `is distinct from` is TRUE against null, which would
    -- insert a notification with a null user_id.
    if v_owner_id is null or v_owner_id = new.user_id then
      return new;
    end if;

    if public.is_blocked(v_owner_id, new.user_id) then
      return new;
    end if;

    if public.notify_recent_duplicate(
         v_owner_id, 'spot_like', new.spot_id, new.user_id, null, interval '12 hours') then
      return new;
    end if;

    insert into public.notifications (user_id, type, title, body, related_id, actor_id, is_read)
    values (
      v_owner_id,
      'spot_like',
      public.notify_display_name(new.user_id) || ' liked your spot',
      v_spot_title,
      new.spot_id,
      new.user_id,
      false
    );
  exception when others then
    raise warning 'notify_spot_like failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_spot_like_insert on public.spot_likes;
create trigger on_spot_like_insert
  after insert on public.spot_likes
  for each row execute function public.notify_spot_like();

-- ============================================================
-- 4. spot_comments -> spot owner AND/OR parent comment author
-- ============================================================

create or replace function public.notify_spot_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id      uuid;
  v_spot_title    text;
  v_parent_author uuid;
  v_actor_name    text;
  v_excerpt       text;
begin
  -- The whole body is guarded, not just the insert — a lookup failure here
  -- must never roll back the comment itself any more than an insert failure
  -- should.
  begin
    select s.created_by, s.title into v_owner_id, v_spot_title
    from public.spots s
    where s.id = new.spot_id;

    if new.parent_comment_id is not null then
      -- `and c.spot_id = new.spot_id` is a guard, not decoration:
      -- spot_comments is a direct client insert, so a forged
      -- parent_comment_id pointing at another spot's comment could
      -- otherwise notify an unrelated user.
      select c.user_id into v_parent_author
      from public.spot_comments c
      where c.id = new.parent_comment_id
        and c.spot_id = new.spot_id;
    end if;

    v_actor_name := public.notify_display_name(new.user_id);
    v_excerpt := left(regexp_replace(coalesce(new.content, ''), '\s+', ' ', 'g'), 140);

    -- One statement, two candidate recipients, `distinct on (user_id)`
    -- collapses them when they're the same person. prio 1 < 2 means the
    -- reply notification wins when the parent author IS the spot owner, so
    -- that person gets exactly ONE row, typed 'comment_reply'.
    insert into public.notifications
      (user_id, type, title, body, related_id, related_comment_id, actor_id, is_read)
    select distinct on (r.user_id)
      r.user_id,
      r.type,
      case when r.type = 'comment_reply'
           then v_actor_name || ' replied to your comment'
           else v_actor_name || ' commented on your spot'
      end,
      case when r.type = 'comment_reply'
           then v_excerpt
           else coalesce(v_spot_title || ' · ', '') || v_excerpt
      end,
      new.spot_id,
      new.id,
      new.user_id,
      false
    from (values
      (v_parent_author, 'comment_reply'::text, 1),
      (v_owner_id,      'spot_comment'::text,  2)
    ) as r(user_id, type, prio)
    where r.user_id is not null
      and r.user_id <> new.user_id            -- never notify yourself
      and not public.is_blocked(r.user_id, new.user_id)
    order by r.user_id, r.prio;
  exception when others then
    raise warning 'notify_spot_comment failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_spot_comment_insert on public.spot_comments;
create trigger on_spot_comment_insert
  after insert on public.spot_comments
  for each row execute function public.notify_spot_comment();

-- ============================================================
-- 5. comment_likes -> comment author
-- ============================================================

create or replace function public.notify_comment_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author  uuid;
  v_spot_id uuid;
  v_excerpt text;
begin
  -- The whole body is guarded, not just the insert — a lookup failure here
  -- must never roll back the like itself any more than an insert failure
  -- should.
  begin
    select c.user_id,
           c.spot_id,
           left(regexp_replace(coalesce(c.content, ''), '\s+', ' ', 'g'), 140)
      into v_author, v_spot_id, v_excerpt
    from public.spot_comments c
    where c.id = new.comment_id;

    if v_author is null or v_author = new.user_id then
      return new;
    end if;

    if public.is_blocked(v_author, new.user_id) then
      return new;
    end if;

    -- Deduped on the COMMENT, not the spot: two different comments on the
    -- same spot are two different notifications.
    if public.notify_recent_duplicate(
         v_author, 'comment_like', v_spot_id, new.user_id, new.comment_id, interval '12 hours') then
      return new;
    end if;

    insert into public.notifications
      (user_id, type, title, body, related_id, related_comment_id, actor_id, is_read)
    values (
      v_author,
      'comment_like',
      public.notify_display_name(new.user_id) || ' liked your comment',
      v_excerpt,
      v_spot_id,          -- tapping opens the spot
      new.comment_id,     -- ...and a future client can scroll to the comment
      new.user_id,
      false
    );
  exception when others then
    raise warning 'notify_comment_like failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_comment_like_insert on public.comment_likes;
create trigger on_comment_like_insert
  after insert on public.comment_likes
  for each row execute function public.notify_comment_like();

-- ============================================================
-- 6. messages -> spot shared + message request (one combined trigger)
-- ============================================================
--
-- Coexists with the existing on_message_insert / handle_new_message trigger.
-- handle_new_message writes two rows: the sender's own row (status
-- 'request' -> 'accepted'), and separately any 'left' member reviving to
-- 'accepted' (added in chat_phase2, not scoped to the sender). This function
-- only ever reads a row with status = 'request'. Since 'left' and 'request'
-- are mutually exclusive on any single row, that second write can never
-- touch the row this function is looking for — order-independent in
-- practice today, though not because the write is scoped to the sender.
-- Re-check this comment if 'left'/'request' semantics ever change.

create or replace function public.notify_message_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id   uuid;
  v_spot_title text;
  v_recipient  uuid;
  v_is_group   boolean;
begin
  ------------------------------------------------------------------
  -- (a) A spot was shared into a chat -> notify the spot's owner
  ------------------------------------------------------------------
  -- The whole section is guarded, not just the insert — a lookup failure
  -- here must never roll back the message send any more than an insert
  -- failure should.
  begin
    if new.message_type = 'spot' and new.shared_spot_id is not null then
      select s.created_by, s.title into v_owner_id, v_spot_title
      from public.spots s
      where s.id = new.shared_spot_id;

      if v_owner_id is not null
         and v_owner_id <> new.sender_id
         and not public.is_blocked(v_owner_id, new.sender_id)
         and not public.notify_recent_duplicate(
               v_owner_id, 'spot_shared', new.shared_spot_id, new.sender_id, null, interval '6 hours')
      then
        insert into public.notifications (user_id, type, title, body, related_id, actor_id, is_read)
        values (
          v_owner_id,
          'spot_shared',
          public.notify_display_name(new.sender_id) || ' shared your spot',
          v_spot_title,
          new.shared_spot_id,
          new.sender_id,
          false
        );
      end if;
    end if;
  exception when others then
    raise warning 'notify_message_events(spot_shared) failed: %', sqlerrm;
  end;

  ------------------------------------------------------------------
  -- (b) First message of a pending 1:1 request -> notify the recipient
  ------------------------------------------------------------------
  -- The whole section is guarded, not just the insert — a lookup failure
  -- here must never roll back the message send any more than an insert
  -- failure should.
  begin
    -- Cheapest gate first: in an already-accepted conversation (the common
    -- case) this single index probe returns null and everything below is
    -- skipped.
    select cm.user_id into v_recipient
    from public.conversation_members cm
    where cm.conversation_id = new.conversation_id
      and cm.user_id <> new.sender_id
      and cm.status = 'request'
    limit 1;

    if v_recipient is null then
      return new;
    end if;

    select c.is_group into v_is_group
    from public.conversations c
    where c.id = new.conversation_id;

    if coalesce(v_is_group, true) then
      return new;                       -- 1:1 only
    end if;

    -- "Am I the earliest message?" rather than count(*) = 1 — correct even
    -- for a multi-row INSERT (all rows in one statement share created_at,
    -- the id breaks the tie so exactly one wins), and it's an index probe
    -- instead of a full count on every message ever sent.
    if exists (
      select 1 from public.messages m
      where m.conversation_id = new.conversation_id
        and (m.created_at, m.id) < (new.created_at, new.id)
    ) then
      return new;
    end if;

    if public.notify_recent_duplicate(
         v_recipient, 'message_request', new.conversation_id, new.sender_id, null, interval '24 hours') then
      return new;
    end if;

    insert into public.notifications (user_id, type, title, body, related_id, actor_id, is_read)
    values (
      v_recipient,
      'message_request',
      public.notify_display_name(new.sender_id) || ' sent you a message request',
      case when new.message_type = 'text'
           then left(regexp_replace(coalesce(new.content, ''), '\s+', ' ', 'g'), 140)
           else null
      end,
      new.conversation_id,
      new.sender_id,
      false
    );
  exception when others then
    raise warning 'notify_message_events(message_request) failed: %', sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_message_insert_notify on public.messages;
create trigger on_message_insert_notify
  after insert on public.messages
  for each row execute function public.notify_message_events();

-- ============================================================
-- 7. Read RPC — return type changes, so drop first (project convention)
-- ============================================================

drop function if exists public.get_notifications(timestamptz, int);
create or replace function public.get_notifications(
  p_before timestamptz default null,
  p_limit int default 30
)
returns table (
  id                 uuid,
  type               text,
  title              text,
  body               text,
  related_id         uuid,
  related_comment_id uuid,
  is_read            boolean,
  created_at         timestamptz,
  actor_id           uuid,
  actor_username     text,
  actor_full_name    text,
  actor_avatar_url   text,
  spot_title         text,
  spot_photo_url     text
)
language sql security definer set search_path = public stable
as $$
  select
    n.id, n.type, n.title, n.body,
    n.related_id, n.related_comment_id, n.is_read, n.created_at,
    n.actor_id, a.username, a.full_name, a.avatar_url,
    s.title, s.photo_url
  from public.notifications n
  -- Both joins are on primary keys, so neither can multiply rows.
  -- actor_id is null on the legacy connect_* rows -> nulls, no error.
  left join public.profiles a on a.id = n.actor_id
  -- related_id is polymorphic (spot / connection / conversation id). A LEFT
  -- JOIN that finds no match yields nulls; it is not an error.
  left join public.spots s on s.id = n.related_id
  where n.user_id = auth.uid()
    and (p_before is null or n.created_at < p_before)
  order by n.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;
grant execute on function public.get_notifications(timestamptz, int) to authenticated;
