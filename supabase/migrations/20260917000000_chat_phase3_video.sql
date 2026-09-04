-- Wanderlens Chat — Video messages
-- Reuses the existing private message-media bucket (already RLS-scoped to
-- conversation membership) — no new bucket needed, video files just land
-- there alongside photos.

alter table public.messages add column if not exists video_duration_seconds integer;

alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
  check (message_type in ('text', 'image', 'gallery', 'spot', 'location', 'video'));

alter table public.messages drop constraint if exists messages_content_or_media_check;
alter table public.messages add constraint messages_content_or_media_check
  check (
    (message_type = 'text' and content is not null)
    or (message_type = 'image' and media_path is not null)
    or (message_type = 'gallery')
    or (message_type = 'spot' and shared_spot_id is not null)
    or (message_type = 'location' and location_lat is not null and location_lng is not null)
    or (message_type = 'video' and media_path is not null)
  );

-- ============================================================
-- RPCs: carry video_duration_seconds alongside everything already there
-- ============================================================

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
  message_type text,
  media_path text,
  video_duration_seconds integer,
  gallery_layout text,
  client_generated_id text,
  created_at timestamptz,
  sender_username text,
  sender_full_name text,
  sender_avatar_url text,
  reply_to_id uuid,
  reply_to_content text,
  reply_to_sender_name text,
  reactions jsonb,
  attachments jsonb,
  shared_spot_id uuid,
  shared_spot_title text,
  shared_spot_photo_url text,
  shared_spot_genre text,
  shared_spot_location_label text,
  location_lat double precision,
  location_lng double precision,
  location_label text
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
      m.id, m.sender_id, m.content, m.message_type, m.media_path, m.video_duration_seconds, m.gallery_layout, m.client_generated_id, m.created_at,
      p.username, p.full_name, p.avatar_url,
      rm.id, rm.content, coalesce(rp.username, rp.full_name),
      coalesce(
        (select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'user_id', r.user_id))
         from public.message_reactions r where r.message_id = m.id),
        '[]'::jsonb
      ),
      coalesce(
        (select jsonb_agg(jsonb_build_object('id', a.id, 'media_path', a.media_path) order by a.position)
         from public.message_attachments a where a.message_id = m.id),
        '[]'::jsonb
      ),
      s.id, s.title, s.photo_url, s.genre, s.location_label,
      m.location_lat, m.location_lng, m.location_label
    from public.messages m
    join public.profiles p on p.id = m.sender_id
    left join public.messages rm on rm.id = m.reply_to_id
    left join public.profiles rp on rp.id = rm.sender_id
    left join public.spots s on s.id = m.shared_spot_id
    where m.conversation_id = p_conversation_id
      and (p_before is null or m.created_at < p_before)
      and m.created_at > coalesce(v_cleared_at, '-infinity'::timestamptz)
    order by m.created_at desc
    limit least(greatest(p_limit, 1), 100);
end;
$$;
grant execute on function public.get_conversation_messages(uuid, timestamptz, int) to authenticated;

-- list_conversations: a video last message shows a film-camera preview line
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
        when lm.message_type = 'location' then '📍 ' || coalesce(lm.loc_label, 'Location')
        when lm.message_type = 'video' then '🎞️ Video'
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
      (select s.title from public.spots s where s.id = m.shared_spot_id) as spot_title,
      m.location_label as loc_label
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
