-- Wanderlens Chat — search within a conversation
-- Server-side so it searches full history, not just what's currently paged
-- into the client's message list.

drop function if exists public.search_conversation_messages(uuid, text, int);
create or replace function public.search_conversation_messages(p_conversation_id uuid, p_query text, p_limit int default 50)
returns table (
  id uuid,
  sender_id uuid,
  content text,
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
    select m.id, m.sender_id, m.content, m.created_at, p.username, p.full_name
    from public.messages m
    join public.profiles p on p.id = m.sender_id
    where m.conversation_id = p_conversation_id
      and m.content is not null
      and m.content ilike '%' || p_query || '%'
      and m.created_at > coalesce(v_cleared_at, '-infinity'::timestamptz)
    order by m.created_at desc
    limit least(greatest(p_limit, 1), 100);
end;
$$;
grant execute on function public.search_conversation_messages(uuid, text, int) to authenticated;
