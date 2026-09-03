-- Wanderlens Chat — Phase 4 (Groups foundation)
-- conversations.is_group and conversation_members.role already existed from
-- Phase 1's forward-compat design — this is the first migration that
-- actually uses them. Scope: create a group, membership management (add/
-- remove/admin), leave group, group messaging via the existing pipeline.
-- Deferred: group photo/description editing, mentions, granular permissions.

alter table public.conversations add column if not exists avatar_url text;
alter table public.conversations add column if not exists description text;

-- ============================================================
-- Group-removal must be a hard delete, not the 1:1 "status = left"
-- pattern — Phase 2's handle_new_message trigger auto-revives any 'left'
-- member on new activity (correct for "I deleted this DM, they texted
-- again"), which would silently re-add a removed/left group member the
-- next time anyone in the group sent a message. Deleting the row instead
-- leaves nothing for that trigger to revive.
-- ============================================================

create or replace function public.is_group_admin(p_conversation_id uuid, p_user_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = p_conversation_id and user_id = p_user_id
      and role = 'admin' and status <> 'left'
  );
$$;

drop function if exists public.create_group_conversation(text, uuid[]);
create or replace function public.create_group_conversation(p_name text, p_member_ids uuid[])
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_conversation_id uuid;
  v_member_id uuid;
begin
  if v_me is null then raise exception 'not authenticated'; end if;
  if p_name is null or length(trim(p_name)) = 0 then raise exception 'group name required'; end if;

  insert into public.conversations (is_group, name) values (true, trim(p_name))
  returning id into v_conversation_id;

  insert into public.conversation_members (conversation_id, user_id, role, status)
  values (v_conversation_id, v_me, 'admin', 'accepted');

  foreach v_member_id in array p_member_ids loop
    if v_member_id <> v_me and not public.is_blocked(v_me, v_member_id) then
      insert into public.conversation_members (conversation_id, user_id, role, status)
      values (v_conversation_id, v_member_id, 'member', 'accepted')
      on conflict (conversation_id, user_id) do nothing;
    end if;
  end loop;

  return v_conversation_id;
end;
$$;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;

drop function if exists public.add_group_members(uuid, uuid[]);
create or replace function public.add_group_members(p_conversation_id uuid, p_member_ids uuid[])
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_member_id uuid;
begin
  if not public.is_group_admin(p_conversation_id, v_me) then
    raise exception 'only admins can add members';
  end if;
  foreach v_member_id in array p_member_ids loop
    if not public.is_blocked(v_me, v_member_id) then
      insert into public.conversation_members (conversation_id, user_id, role, status)
      values (p_conversation_id, v_member_id, 'member', 'accepted')
      on conflict (conversation_id, user_id) do update set status = 'accepted';
    end if;
  end loop;
end;
$$;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;

drop function if exists public.remove_group_member(uuid, uuid);
create or replace function public.remove_group_member(p_conversation_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_group_admin(p_conversation_id, auth.uid()) then
    raise exception 'only admins can remove members';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'use leave_group_conversation to remove yourself';
  end if;
  if (select role from public.conversation_members where conversation_id = p_conversation_id and user_id = p_user_id) = 'admin'
     and (select count(*) from public.conversation_members where conversation_id = p_conversation_id and role = 'admin' and status <> 'left') <= 1 then
    raise exception 'cannot remove the last admin — promote someone else first';
  end if;
  delete from public.conversation_members where conversation_id = p_conversation_id and user_id = p_user_id;
end;
$$;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;

drop function if exists public.leave_group_conversation(uuid);
create or replace function public.leave_group_conversation(p_conversation_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if (select role from public.conversation_members where conversation_id = p_conversation_id and user_id = v_me) = 'admin'
     and (select count(*) from public.conversation_members where conversation_id = p_conversation_id and role = 'admin' and status <> 'left') <= 1
     and (select count(*) from public.conversation_members where conversation_id = p_conversation_id and status <> 'left') > 1 then
    raise exception 'promote another admin before leaving';
  end if;
  delete from public.conversation_members where conversation_id = p_conversation_id and user_id = v_me;
end;
$$;
grant execute on function public.leave_group_conversation(uuid) to authenticated;

drop function if exists public.set_group_admin(uuid, uuid, boolean);
create or replace function public.set_group_admin(p_conversation_id uuid, p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_group_admin(p_conversation_id, auth.uid()) then
    raise exception 'only admins can change roles';
  end if;
  if not p_is_admin
     and (select count(*) from public.conversation_members where conversation_id = p_conversation_id and role = 'admin' and status <> 'left') <= 1
     and (select role from public.conversation_members where conversation_id = p_conversation_id and user_id = p_user_id) = 'admin' then
    raise exception 'cannot remove the last admin';
  end if;
  update public.conversation_members set role = case when p_is_admin then 'admin' else 'member' end
  where conversation_id = p_conversation_id and user_id = p_user_id;
end;
$$;
grant execute on function public.set_group_admin(uuid, uuid, boolean) to authenticated;

drop function if exists public.get_conversation_info(uuid);
create or replace function public.get_conversation_info(p_conversation_id uuid)
returns table (
  is_group boolean,
  name text,
  avatar_url text,
  description text,
  member_count integer,
  my_role text
)
language sql security definer set search_path = public stable
as $$
  select
    c.is_group, c.name, c.avatar_url, c.description,
    (select count(*)::int from public.conversation_members cm2 where cm2.conversation_id = c.id and cm2.status <> 'left'),
    (select role from public.conversation_members cm3 where cm3.conversation_id = c.id and cm3.user_id = auth.uid())
  from public.conversations c
  where c.id = p_conversation_id and public.is_conversation_member(c.id);
$$;
grant execute on function public.get_conversation_info(uuid) to authenticated;

-- ============================================================
-- list_conversations: carry group identity alongside the 1:1 "other person"
-- fields (which stay null/unused for a group row)
-- ============================================================

drop function if exists public.list_conversations(text, boolean);
create or replace function public.list_conversations(p_status text default null, p_archived boolean default false)
returns table (
  conversation_id        uuid,
  is_group                boolean,
  group_name              text,
  group_avatar_url        text,
  member_count            integer,
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
    c.is_group,
    c.name,
    c.avatar_url,
    (select count(*)::int from public.conversation_members cm4 where cm4.conversation_id = c.id and cm4.status <> 'left'),
    other.id,
    other.username,
    other.full_name,
    other.avatar_url,
    coalesce(
      lm.content,
      case
        when lm.message_type = 'image' then '📷 Photo'
        when lm.message_type = 'gallery' then '📷 ' || coalesce(lm.attachment_count, 0)::text || ' Photos'
        when lm.message_type = 'spot' then '📍 ' || coalesce(lm.spot_title, 'A spot')
        else null
      end
    ),
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
    where cm2.conversation_id = c.id and cm2.user_id <> auth.uid() and c.is_group = false
    limit 1
  ) other on true
  left join lateral (
    select m.content, m.message_type, m.created_at, m.sender_id,
      (select count(*)::int from public.message_attachments a where a.message_id = m.id) as attachment_count,
      (select s.title from public.spots s where s.id = m.shared_spot_id) as spot_title
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

-- ============================================================
-- messages INSERT: the blocked-pair check only makes sense for 1:1 —
-- blocking one person in a large group shouldn't silence the whole group.
-- ============================================================

drop policy if exists "Members can send messages" on public.messages;
create policy "Members can send messages"
  on public.messages for insert
  with check (
    public.is_conversation_member(conversation_id)
    and auth.uid() = sender_id
    and not exists (
      select 1 from public.conversation_members cm
      join public.conversations c on c.id = cm.conversation_id
      where cm.conversation_id = messages.conversation_id
        and cm.user_id <> auth.uid()
        and c.is_group = false
        and public.is_blocked(auth.uid(), cm.user_id)
    )
  );
