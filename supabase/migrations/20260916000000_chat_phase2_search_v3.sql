-- Wanderlens Chat — search v3: rich previews in results, not just text.
-- A matched spot now carries its photo/genre/location for a real preview
-- card; a matched location carries its coordinates; a matched photo/gallery
-- carries the first image's storage path for a thumbnail.

drop function if exists public.search_conversation_messages(uuid, text, int);
create or replace function public.search_conversation_messages(p_conversation_id uuid, p_query text, p_limit int default 50)
returns table (
  id uuid,
  sender_id uuid,
  message_type text,
  content text,
  created_at timestamptz,
  sender_username text,
  sender_full_name text,
  media_path text,
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
  if p_query is null or length(trim(p_query)) = 0 then
    return;
  end if;

  select cleared_at into v_cleared_at
  from public.conversation_members
  where conversation_id = p_conversation_id and user_id = auth.uid();

  return query
    select
      m.id, m.sender_id, m.message_type, m.content, m.created_at, p.username, p.full_name,
      coalesce(m.media_path, first_att.media_path),
      s.id, s.title, s.photo_url, s.genre, s.location_label,
      m.location_lat, m.location_lng, m.location_label
    from public.messages m
    join public.profiles p on p.id = m.sender_id
    left join public.spots s on s.id = m.shared_spot_id
    left join lateral (
      select a.media_path from public.message_attachments a
      where a.message_id = m.id order by a.position limit 1
    ) first_att on true
    where m.conversation_id = p_conversation_id
      and m.created_at > coalesce(v_cleared_at, '-infinity'::timestamptz)
      and (
        m.content ilike '%' || p_query || '%'
        or (m.message_type = 'spot' and s.title ilike '%' || p_query || '%')
        or (m.message_type = 'location' and m.location_label ilike '%' || p_query || '%')
      )
    order by m.created_at desc
    limit least(greatest(p_limit, 1), 100);
end;
$$;
grant execute on function public.search_conversation_messages(uuid, text, int) to authenticated;
