-- Wanderlens Chat — Phase 4c (Group info: shared photos + shared spots)

drop function if exists public.get_group_shared_photos(uuid, int);
create or replace function public.get_group_shared_photos(p_conversation_id uuid, p_limit int default 60)
returns table (media_path text, created_at timestamptz)
language sql security definer set search_path = public stable
as $$
  select combined.media_path, combined.created_at from (
    select m.media_path, m.created_at
    from public.messages m
    where m.conversation_id = p_conversation_id and m.message_type = 'image' and m.media_path is not null
    union all
    select a.media_path, m.created_at
    from public.message_attachments a
    join public.messages m on m.id = a.message_id
    where m.conversation_id = p_conversation_id
  ) combined
  where public.is_conversation_member(p_conversation_id)
  order by combined.created_at desc
  limit least(greatest(p_limit, 1), 200);
$$;
grant execute on function public.get_group_shared_photos(uuid, int) to authenticated;

drop function if exists public.get_group_shared_spots(uuid);
create or replace function public.get_group_shared_spots(p_conversation_id uuid)
returns table (
  message_id uuid,
  spot_id uuid,
  title text,
  photo_url text,
  genre text,
  location_label text,
  created_at timestamptz
)
language sql security definer set search_path = public stable
as $$
  select m.id, s.id, s.title, s.photo_url, s.genre, s.location_label, m.created_at
  from public.messages m
  join public.spots s on s.id = m.shared_spot_id
  where m.conversation_id = p_conversation_id and public.is_conversation_member(p_conversation_id)
  order by m.created_at desc;
$$;
grant execute on function public.get_group_shared_spots(uuid) to authenticated;
