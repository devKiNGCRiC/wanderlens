-- Wanderlens Chat — search v2: also match shared-spot titles and shared
-- location labels, not just typed text content. Previously a message
-- sharing "Mechuka Valley" with no caption was invisible to search even if
-- you searched "Mechuka" — the spot title lives in a joined table, not
-- messages.content, and never reached the query.

drop function if exists public.search_conversation_messages(uuid, text, int);
create or replace function public.search_conversation_messages(p_conversation_id uuid, p_query text, p_limit int default 50)
returns table (
  id uuid,
  sender_id uuid,
  message_type text,
  display_text text,
  created_at timestamptz,
  sender_username text,
  sender_full_name text
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
      m.id, m.sender_id, m.message_type,
      coalesce(m.content, s.title, m.location_label),
      m.created_at, p.username, p.full_name
    from public.messages m
    join public.profiles p on p.id = m.sender_id
    left join public.spots s on s.id = m.shared_spot_id
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
