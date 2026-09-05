-- Wanderlens — fix root cause of missing social-event notifications
--
-- The live `notifications` table has always had a check constraint on
-- `type` (auto-named `notifications_type_check` by Postgres, confirmed from
-- the actual constraint-violation error in the Postgres logs) restricting it
-- to only 'connect_request' / 'connect_accepted' — the two values that
-- existed before this session's work. That constraint was never captured in
-- any tracked migration, so 20260921000000_notifications_social_events.sql
-- didn't know to widen it. Every new trigger's insert was failing this
-- constraint and being silently caught by that migration's own
-- exception-guard (logged as a warning, not surfaced anywhere in the app) —
-- the guard worked exactly as designed, it just wasn't the intended failure
-- mode. This migration is the actual fix.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'connect_request', 'connect_accepted',
    'spot_like', 'spot_comment', 'comment_reply', 'comment_like',
    'spot_shared', 'message_request'
  ));
