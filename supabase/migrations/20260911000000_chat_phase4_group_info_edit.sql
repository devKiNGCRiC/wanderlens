-- Wanderlens Chat — Phase 4b (Group photo + description editing)
-- conversations.avatar_url/description already existed (added in the Phase 4
-- foundation migration) but had no write path yet.

create or replace function public.update_group_info(p_conversation_id uuid, p_name text, p_description text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_group_admin(p_conversation_id, auth.uid()) then
    raise exception 'only admins can edit group info';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'group name required';
  end if;
  update public.conversations
  set name = trim(p_name), description = nullif(trim(coalesce(p_description, '')), '')
  where id = p_conversation_id and is_group = true;
end;
$$;
grant execute on function public.update_group_info(uuid, text, text) to authenticated;

create or replace function public.set_group_avatar(p_conversation_id uuid, p_avatar_url text)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_group_admin(p_conversation_id, auth.uid()) then
    raise exception 'only admins can change the group photo';
  end if;
  update public.conversations set avatar_url = p_avatar_url where id = p_conversation_id and is_group = true;
end;
$$;
grant execute on function public.set_group_avatar(uuid, text) to authenticated;

-- ============================================================
-- STORAGE: group photos are public-read (same sensitivity as a profile
-- avatar — every member already sees it), unlike message-media's private
-- signed-URL model. Upload restricted to that group's admins.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('group-media', 'group-media', true)
on conflict (id) do nothing;

do $$ begin
  create policy "anyone can view group photos"
    on storage.objects for select
    using (bucket_id = 'group-media');
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "group admins can upload the group photo"
    on storage.objects for insert
    with check (
      bucket_id = 'group-media'
      and public.is_group_admin(((storage.foldername(name))[1])::uuid, auth.uid())
    );
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "group admins can replace the group photo"
    on storage.objects for update
    using (
      bucket_id = 'group-media'
      and public.is_group_admin(((storage.foldername(name))[1])::uuid, auth.uid())
    );
exception when duplicate_object then null;
end $$;
