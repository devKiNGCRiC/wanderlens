-- Wanderlens — In-app notification bell
-- The `notifications` table already exists live (populated by triggers on
-- connection events — see ROADMAP.md) but was never captured in a tracked
-- migration. Confirmed live shape via information_schema before writing this:
--   notifications(id uuid pk, user_id uuid, type text, title text, body text,
--     related_id uuid, is_read boolean, created_at timestamptz)
--   observed type values: 'connect_request', 'connect_accepted'
-- This migration only adds RLS (idempotent — safe even if already enabled)
-- and the read-side RPCs. It does not touch the existing insert triggers.

alter table public.notifications enable row level security;

do $$ begin
  create policy "users can view their own notifications"
    on public.notifications for select
    using (user_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

drop function if exists public.get_notifications(timestamptz, int);
create or replace function public.get_notifications(p_before timestamptz default null, p_limit int default 30)
returns table (
  id uuid,
  type text,
  title text,
  body text,
  related_id uuid,
  is_read boolean,
  created_at timestamptz
)
language sql security definer set search_path = public stable
as $$
  select n.id, n.type, n.title, n.body, n.related_id, n.is_read, n.created_at
  from public.notifications n
  where n.user_id = auth.uid()
    and (p_before is null or n.created_at < p_before)
  order by n.created_at desc
  limit least(greatest(p_limit, 1), 100);
$$;
grant execute on function public.get_notifications(timestamptz, int) to authenticated;

drop function if exists public.get_unread_notification_count();
create or replace function public.get_unread_notification_count()
returns integer
language sql security definer set search_path = public stable
as $$
  select count(*)::int from public.notifications where user_id = auth.uid() and is_read = false;
$$;
grant execute on function public.get_unread_notification_count() to authenticated;

drop function if exists public.mark_notifications_read();
create or replace function public.mark_notifications_read()
returns void
language sql security definer set search_path = public
as $$
  update public.notifications set is_read = true where user_id = auth.uid() and is_read = false;
$$;
grant execute on function public.mark_notifications_read() to authenticated;
