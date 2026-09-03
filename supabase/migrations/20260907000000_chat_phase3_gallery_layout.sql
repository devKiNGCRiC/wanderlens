-- Wanderlens Chat — Phase 3c
-- The gallery layout (scattered polaroid collage vs. compact grid) is now an
-- explicit choice the sender makes at send time, stored on the message —
-- not auto-guessed from photo count on every render (which meant the choice
-- couldn't be "grid at 3 photos" or "collage at 5", and didn't survive
-- consistently between sender and recipient views).

alter table public.messages add column if not exists gallery_layout text check (gallery_layout in ('collage', 'grid'));

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
  attachments jsonb
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
      m.id, m.sender_id, m.content, m.message_type, m.media_path, m.gallery_layout, m.client_generated_id, m.created_at,
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
