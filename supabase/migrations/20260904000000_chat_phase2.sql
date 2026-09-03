-- Wanderlens Chat — Phase 2 (Chat experience)
-- Idempotent, additive onto the Phase 1 schema. Adds: per-member conversation
-- flags (pin/mute/favorite/archive), clear/delete-for-me, mark-unread, message
-- replies, reactions, reporting, and closes the block-enforcement gap on
-- `messages` INSERT now that Block is a real, reachable feature.

-- ============================================================
-- ADAPT EXISTING TABLES — additive only
-- ============================================================

alter table public.conversation_members add column if not exists is_pinned boolean not null default false;
alter table public.conversation_members add column if not exists is_muted boolean not null default false;
alter table public.conversation_members add column if not exists is_favorite boolean not null default false;
alter table public.conversation_members add column if not exists is_archived boolean not null default false;
alter table public.conversation_members add column if not exists cleared_at timestamptz;

alter table public.messages add column if not exists reply_to_id uuid references public.messages(id) on delete set null;
create index if not exists messages_reply_to_id_idx on public.messages(reply_to_id);

-- ============================================================
-- NEW TABLES
-- ============================================================

create table if not exists public.message_reactions (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);
create index if not exists message_reactions_message_id_idx on public.message_reactions(message_id);

alter table public.message_reactions enable row level security;

do $$ begin
  create policy "members can view reactions in their conversations"
    on public.message_reactions for select
    using (exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and public.is_conversation_member(m.conversation_id)
    ));
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "members can react to messages in their conversations"
    on public.message_reactions for insert
    with check (
      user_id = auth.uid()
      and exists (
        select 1 from public.messages m
        where m.id = message_reactions.message_id
          and public.is_conversation_member(m.conversation_id)
      )
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "users can remove their own reaction"
    on public.message_reactions for delete
    using (user_id = auth.uid());
exception when duplicate_object then null;
end $$;

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('user', 'message', 'conversation')),
  target_id   uuid not null,
  reason      text not null,
  details     text,
  status      text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at  timestamptz not null default now()
);
create index if not exists reports_reporter_id_idx on public.reports(reporter_id);

alter table public.reports enable row level security;

do $$ begin
  create policy "users can view their own reports"
    on public.reports for select
    using (reporter_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "users can file a report"
    on public.reports for insert
    with check (reporter_id = auth.uid());
exception when duplicate_object then null;
end $$;

-- ============================================================
-- REALTIME: conversation_members, so read-receipt (last_read_at) updates
-- propagate live to the other participant's open thread screen.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_members'
  ) then
    alter publication supabase_realtime add table public.conversation_members;
  end if;
end $$;

-- ============================================================
-- CLOSE THE BLOCK-ENFORCEMENT GAP
-- Phase 1 deliberately left the original "Members can send messages" policy
-- untouched since nothing could write to blocked_users yet. Block is now a
-- real, reachable feature (see UI), so this replaces it with the exact same
-- check plus the blocked-pair guard. Preserves the original policy's logic
-- verbatim (confirmed via live introspection) and only adds one AND clause.
-- ============================================================

drop policy if exists "Members can send messages" on public.messages;
create policy "Members can send messages"
  on public.messages for insert
  with check (
    public.is_conversation_member(conversation_id)
    and auth.uid() = sender_id
    and not exists (
      select 1 from public.conversation_members cm
      where cm.conversation_id = messages.conversation_id
        and cm.user_id <> auth.uid()
        and public.is_blocked(auth.uid(), cm.user_id)
    )
  );

-- ============================================================
-- TRIGGER: extend to revive a conversation for anyone who'd deleted it
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

  -- Any new activity brings the conversation back into view for anyone who
  -- had deleted it — matches how WhatsApp/IG "delete chat" behaves. Their
  -- older history stays hidden (cleared_at is untouched), only new activity
  -- shows.
  update public.conversation_members
  set status = 'accepted'
  where conversation_id = new.conversation_id
    and status = 'left';

  return new;
end;
$$;

-- ============================================================
-- RPCs
-- ============================================================

-- Single parameterized setter for the four boolean conversation flags, rather
-- than four near-identical functions. p_flag is validated against an
-- allowlist and branched explicitly (no dynamic SQL / column injection risk).
drop function if exists public.set_conversation_flag(uuid, text, boolean);
create or replace function public.set_conversation_flag(p_conversation_id uuid, p_flag text, p_value boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_flag = 'pinned' then
    update public.conversation_members set is_pinned = p_value where conversation_id = p_conversation_id and user_id = auth.uid();
  elsif p_flag = 'muted' then
    update public.conversation_members set is_muted = p_value where conversation_id = p_conversation_id and user_id = auth.uid();
  elsif p_flag = 'favorite' then
    update public.conversation_members set is_favorite = p_value where conversation_id = p_conversation_id and user_id = auth.uid();
  elsif p_flag = 'archived' then
    update public.conversation_members set is_archived = p_value where conversation_id = p_conversation_id and user_id = auth.uid();
  else
    raise exception 'unknown flag: %', p_flag;
  end if;
end;
$$;
grant execute on function public.set_conversation_flag(uuid, text, boolean) to authenticated;

drop function if exists public.clear_conversation(uuid);
create or replace function public.clear_conversation(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.conversation_members
  set cleared_at = now()
  where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;
grant execute on function public.clear_conversation(uuid) to authenticated;

drop function if exists public.delete_conversation(uuid);
create or replace function public.delete_conversation(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.conversation_members
  set status = 'left', cleared_at = now(), is_pinned = false, is_archived = false
  where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;
grant execute on function public.delete_conversation(uuid) to authenticated;

drop function if exists public.decline_conversation_request(uuid);
create or replace function public.decline_conversation_request(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.conversation_members
  set status = 'left'
  where conversation_id = p_conversation_id and user_id = auth.uid() and status = 'request';
end;
$$;
grant execute on function public.decline_conversation_request(uuid) to authenticated;

drop function if exists public.mark_conversation_unread(uuid);
create or replace function public.mark_conversation_unread(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.conversation_members
  set last_read_at = 'epoch'::timestamptz
  where conversation_id = p_conversation_id and user_id = auth.uid();
end;
$$;
grant execute on function public.mark_conversation_unread(uuid) to authenticated;

drop function if exists public.report_content(text, uuid, text, text);
create or replace function public.report_content(p_target_type text, p_target_id uuid, p_reason text, p_details text default null)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (auth.uid(), p_target_type, p_target_id, p_reason, p_details);
end;
$$;
grant execute on function public.report_content(text, uuid, text, text) to authenticated;

-- list_conversations: adds the new flag columns, a reply-preview-free last
-- message preview (unchanged), archived-view support, and respects cleared_at
-- so a cleared/deleted conversation's preview only reflects activity since.
drop function if exists public.list_conversations(text);
drop function if exists public.list_conversations(text, boolean);
create or replace function public.list_conversations(p_status text default null, p_archived boolean default false)
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
  unread_count            integer,
  is_pinned               boolean,
  is_muted                boolean,
  is_favorite             boolean,
  is_archived             boolean
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
        and um.created_at > coalesce(cm.cleared_at, '-infinity'::timestamptz)
    ),
    cm.is_pinned,
    cm.is_muted,
    cm.is_favorite,
    cm.is_archived
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
      and m.created_at > coalesce(cm.cleared_at, '-infinity'::timestamptz)
    order by m.created_at desc
    limit 1
  ) lm on true
  where cm.user_id = auth.uid()
    and cm.status <> 'left'
    and cm.is_archived = p_archived
    and (p_status is null or cm.status = p_status)
  order by cm.is_pinned desc, coalesce(lm.created_at, c.created_at) desc;
$$;
grant execute on function public.list_conversations(text, boolean) to authenticated;

-- get_conversation_messages: respects cleared_at, returns reply preview +
-- reactions (aggregated as jsonb) so the client doesn't need per-message
-- follow-up queries.
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
  sender_avatar_url text,
  reply_to_id uuid,
  reply_to_content text,
  reply_to_sender_name text,
  reactions jsonb
)
language plpgsql security definer set search_path = public stable
as $$
declare
  v_cleared_at timestamptz;
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not a member of this conversation';
  end if;

  select cleared_at into v_cleared_at
  from public.conversation_members
  where conversation_id = p_conversation_id and user_id = auth.uid();

  return query
    select
      m.id, m.sender_id, m.content, m.client_generated_id, m.created_at,
      p.username, p.full_name, p.avatar_url,
      rm.id, rm.content, coalesce(rp.username, rp.full_name),
      coalesce(
        (select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'user_id', r.user_id))
         from public.message_reactions r where r.message_id = m.id),
        '[]'::jsonb
      )
    from public.messages m
    join public.profiles p on p.id = m.sender_id
    left join public.messages rm on rm.id = m.reply_to_id
    left join public.profiles rp on rp.id = rm.sender_id
    where m.conversation_id = p_conversation_id
      and (p_before is null or m.created_at < p_before)
      and m.created_at > coalesce(v_cleared_at, '-infinity'::timestamptz)
    order by m.created_at desc
    limit least(greatest(p_limit, 1), 100);
end;
$$;
grant execute on function public.get_conversation_messages(uuid, timestamptz, int) to authenticated;

grant execute on function public.is_blocked(uuid, uuid) to authenticated;

-- get_unread_conversation_count: archived conversations no longer count
-- toward the tab badge (muted ones still do — muting silences notifications,
-- not the badge, matching common chat-app convention).
drop function if exists public.get_unread_conversation_count();
create or replace function public.get_unread_conversation_count()
returns integer
language sql security definer set search_path = public stable
as $$
  select count(*)::int
  from public.conversation_members cm
  where cm.user_id = auth.uid()
    and cm.status = 'accepted'
    and cm.is_archived = false
    and exists (
      select 1 from public.messages m
      where m.conversation_id = cm.conversation_id
        and m.sender_id <> auth.uid()
        and m.created_at > cm.last_read_at
        and m.created_at > coalesce(cm.cleared_at, '-infinity'::timestamptz)
    );
$$;
grant execute on function public.get_unread_conversation_count() to authenticated;
