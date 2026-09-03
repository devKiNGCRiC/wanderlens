-- Wanderlens Chat — Phase 1 (Foundation)
--
-- IMPORTANT: conversations / conversation_members / messages / notifications
-- already exist in this project with RLS already enabled, confirmed via live
-- introspection (information_schema.columns, pg_constraint, pg_policies,
-- pg_proc). This migration ADAPTS onto that real schema rather than assuming
-- a fresh one — it only adds what's missing (via `add column if not exists`)
-- and never redefines is_conversation_member or the existing SELECT/INSERT
-- policies on conversations/conversation_members/messages, since those are
-- already relied upon. Safe to re-run: every statement is idempotent.
--
-- Confirmed live shape before this migration:
--   conversations(id pk, is_group bool default false, name text, created_at)
--   conversation_members(conversation_id fk, user_id fk, joined_at,
--     pk (conversation_id, user_id))
--   messages(id pk, conversation_id fk, sender_id fk, content, media_url,
--     created_at)
--   existing policies: conversations SELECT / conversation_members SELECT /
--     messages SELECT+INSERT, all built on is_conversation_member(conversation_id)
--   existing function: is_conversation_member(uuid) — single-arg, checks
--     the calling user via auth.uid() internally

-- ============================================================
-- ADAPT EXISTING TABLES — additive only
-- ============================================================

alter table public.conversation_members
  add column if not exists role text not null default 'member' check (role in ('member', 'admin'));

alter table public.conversation_members
  add column if not exists status text not null default 'accepted' check (status in ('accepted', 'request', 'left'));

alter table public.conversation_members
  add column if not exists last_read_at timestamptz not null default now();

alter table public.messages
  add column if not exists client_generated_id text;

create index if not exists conversation_members_user_id_idx
  on public.conversation_members(user_id);
create index if not exists conversation_members_conversation_id_idx
  on public.conversation_members(conversation_id);
create index if not exists messages_conversation_id_created_at_idx
  on public.messages(conversation_id, created_at desc);
create index if not exists messages_client_generated_id_idx
  on public.messages(client_generated_id);

-- ============================================================
-- NEW TABLE: blocked_users (standalone, decoupled from `connections`)
-- ============================================================

create table if not exists public.blocked_users (
  id         uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index if not exists blocked_users_blocker_id_idx on public.blocked_users(blocker_id);
create index if not exists blocked_users_blocked_id_idx on public.blocked_users(blocked_id);

alter table public.blocked_users enable row level security;

do $$ begin
  create policy "users can view who they blocked"
    on public.blocked_users for select
    using (blocker_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "users can block someone"
    on public.blocked_users for insert
    with check (blocker_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "users can unblock someone"
    on public.blocked_users for delete
    using (blocker_id = auth.uid());
exception when duplicate_object then null;
end $$;

-- ============================================================
-- NEW RLS: only what's missing on the existing tables
-- (existing SELECT policies and is_conversation_member are untouched)
-- ============================================================

-- Needed so a recipient can accept a message request, and so a member can
-- update their own last_read_at from the client.
do $$ begin
  create policy "members can update their own membership row"
    on public.conversation_members for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
exception when duplicate_object then null;
end $$;

-- ============================================================
-- TRIGGER: replying to a message request auto-accepts it
-- ============================================================

create or replace function public.handle_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversation_members
  set status = 'accepted'
  where conversation_id = new.conversation_id
    and user_id = new.sender_id
    and status = 'request';
  return new;
end;
$$;

drop trigger if exists on_message_insert on public.messages;
create trigger on_message_insert
  after insert on public.messages
  for each row execute function public.handle_new_message();

-- ============================================================
-- NEW HELPER: is_blocked (is_conversation_member already exists, untouched)
-- ============================================================

create or replace function public.is_blocked(p_user_a uuid, p_user_b uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.blocked_users
    where (blocker_id = p_user_a and blocked_id = p_user_b)
       or (blocker_id = p_user_b and blocked_id = p_user_a)
  );
$$;

-- ============================================================
-- REALTIME
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ============================================================
-- RPCs
-- ============================================================

drop function if exists public.get_or_create_direct_conversation(uuid);
create or replace function public.get_or_create_direct_conversation(other_user_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_conversation_id uuid;
  v_connected boolean;
  v_lock_key bigint;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if other_user_id = v_me then raise exception 'cannot message yourself'; end if;
  if public.is_blocked(v_me, other_user_id) then raise exception 'unable to start this conversation'; end if;

  -- Serialize concurrent calls for the same pair so a double-tap can't create
  -- two conversations; lock key is symmetric regardless of who calls first.
  v_lock_key := hashtextextended(
    least(v_me, other_user_id)::text || ':' || greatest(v_me, other_user_id)::text, 0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  select c.id into v_conversation_id
  from public.conversations c
  join public.conversation_members m1 on m1.conversation_id = c.id and m1.user_id = v_me
  join public.conversation_members m2 on m2.conversation_id = c.id and m2.user_id = other_user_id
  where c.is_group = false
  limit 1;

  if v_conversation_id is not null then
    return v_conversation_id;
  end if;

  select exists (
    select 1 from public.connections
    where status = 'accepted'
      and ((requester_id = v_me and recipient_id = other_user_id)
        or (requester_id = other_user_id and recipient_id = v_me))
  ) into v_connected;

  insert into public.conversations default values
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id, status) values
    (v_conversation_id, v_me, 'accepted'),
    (v_conversation_id, other_user_id, case when v_connected then 'accepted' else 'request' end);

  return v_conversation_id;
end;
$$;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

drop function if exists public.list_conversations(text);
create or replace function public.list_conversations(p_status text default null)
returns table (
  conversation_id        uuid,
  other_user_id           uuid,
  other_username          text,
  other_full_name         text,
  other_avatar_url        text,
  last_message_preview    text,
  last_message_at         timestamptz,
  last_message_sender_id  uuid,
  my_status               text,
  unread_count            integer
)
language sql security definer set search_path = public stable
as $$
  select
    c.id,
    other.id,
    other.username,
    other.full_name,
    other.avatar_url,
    lm.content,
    lm.created_at,
    lm.sender_id,
    cm.status,
    (
      select count(*)::int from public.messages um
      where um.conversation_id = c.id
        and um.sender_id <> auth.uid()
        and um.created_at > cm.last_read_at
    )
  from public.conversation_members cm
  join public.conversations c on c.id = cm.conversation_id
  left join lateral (
    select p.id, p.username, p.full_name, p.avatar_url
    from public.conversation_members cm2
    join public.profiles p on p.id = cm2.user_id
    where cm2.conversation_id = c.id and cm2.user_id <> auth.uid()
    limit 1
  ) other on true
  left join lateral (
    select m.content, m.created_at, m.sender_id
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  where cm.user_id = auth.uid()
    and (p_status is null or cm.status = p_status)
  order by coalesce(lm.created_at, c.created_at) desc;
$$;
grant execute on function public.list_conversations(text) to authenticated;

drop function if exists public.get_conversation_messages(uuid, timestamptz, int);
create or replace function public.get_conversation_messages(
  p_conversation_id uuid,
  p_before timestamptz default null,
  p_limit int default 30
)
returns table (
  id uuid,
  sender_id uuid,
  content text,
  client_generated_id text,
  created_at timestamptz,
  sender_username text,
  sender_full_name text,
  sender_avatar_url text
)
language plpgsql security definer set search_path = public stable
as $$
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not a member of this conversation';
  end if;
  return query
    select m.id, m.sender_id, m.content, m.client_generated_id, m.created_at,
           p.username, p.full_name, p.avatar_url
    from public.messages m
    join public.profiles p on p.id = m.sender_id
    where m.conversation_id = p_conversation_id
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc
    limit least(greatest(p_limit, 1), 100);
end;
$$;
grant execute on function public.get_conversation_messages(uuid, timestamptz, int) to authenticated;

drop function if exists public.mark_conversation_read(uuid);
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.conversation_members
  set last_read_at = now()
  where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

drop function if exists public.get_unread_conversation_count();
create or replace function public.get_unread_conversation_count()
returns integer
language sql security definer set search_path = public stable
as $$
  select count(*)::int
  from public.conversation_members cm
  where cm.user_id = auth.uid()
    and cm.status = 'accepted'
    and exists (
      select 1 from public.messages m
      where m.conversation_id = cm.conversation_id
        and m.sender_id <> auth.uid()
        and m.created_at > cm.last_read_at
    );
$$;
grant execute on function public.get_unread_conversation_count() to authenticated;
