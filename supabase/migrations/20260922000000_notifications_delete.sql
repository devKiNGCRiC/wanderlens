-- Wanderlens — delete notification(s)
-- Single-notification delete (long-press in app/notifications.tsx) and
-- clear-all (header action). Both scoped to auth.uid() so a client can only
-- ever delete their own rows.

drop function if exists public.delete_notification(uuid);
create or replace function public.delete_notification(p_id uuid)
returns void
language sql security definer set search_path = public
as $$
  delete from public.notifications where id = p_id and user_id = auth.uid();
$$;
grant execute on function public.delete_notification(uuid) to authenticated;

drop function if exists public.clear_all_notifications();
create or replace function public.clear_all_notifications()
returns void
language sql security definer set search_path = public
as $$
  delete from public.notifications where user_id = auth.uid();
$$;
grant execute on function public.clear_all_notifications() to authenticated;
