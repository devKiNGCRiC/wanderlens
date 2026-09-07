-- Wanderlens — account deletion tombstone marker
--
-- Backs the `delete-account` Edge Function. profiles.id IS auth.users.id
-- (shared primary key), so the profile can never outlive the auth.users row
-- it references — the Edge Function anonymizes profiles in place and
-- soft-deletes auth.users (auth.admin.deleteUser(id, true)), which keeps the
-- auth.users row (and its id) intact so nothing that references profiles.id
-- (spots, messages, comments, etc.) needs to change at all. This column is a
-- simple marker for that anonymized state, e.g. for future filtering of
-- deleted users out of discovery lists (not wired up yet — discover_people /
-- nearby_photographers are themselves untracked legacy RPCs; deliberately
-- out of scope here rather than rewriting them blind).

alter table public.profiles add column if not exists deleted_at timestamptz;

-- Runs the entire personal-data cleanup + profile anonymization as one
-- transaction, scoped internally to auth.uid() rather than relying on each
-- caller-scoped table already having the exact DELETE/UPDATE grants this
-- needs (a security review found several gaps: ai_usage revokes delete
-- entirely from authenticated by design, notifications has no delete
-- policy at all — only the clear_all_notifications RPC can clear it, and
-- blocked_users only lets the blocker delete, not the blocked party). A
-- security definer function sidesteps all of that: it runs as the
-- function owner, bypassing RLS, so its correctness depends only on the
-- `where` clauses below, not on grants that can silently no-op instead of
-- erroring. Also means the whole cleanup either fully commits or fully
-- rolls back — no partial state if one step fails.
create or replace function public.delete_own_account_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  delete from public.saved_spots where user_id = uid;
  delete from public.spot_likes where user_id = uid;
  delete from public.comment_likes where user_id = uid;
  delete from public.trails where user_id = uid;
  delete from public.ai_usage where user_id = uid;
  delete from public.notifications where user_id = uid;
  delete from public.connections where requester_id = uid or recipient_id = uid;
  delete from public.blocked_users where blocker_id = uid or blocked_id = uid;
  update public.conversation_members set status = 'left' where user_id = uid and status <> 'left';

  update public.profiles set
    username = 'deleted_user_' || substring(uid::text, 1, 8),
    full_name = 'Deleted user',
    bio = null,
    avatar_url = null,
    banner_url = null,
    user_type = null,
    photography_genres = null,
    place_interests = null,
    travel_style = null,
    home_city = null,
    country = null,
    deleted_at = now()
  where id = uid;
end;
$$;

-- Least privilege: only the caller themselves can invoke this, and only to
-- act on their own auth.uid() (enforced inside the function body, not by a
-- parameter — there is nothing here a caller can point at another user).
revoke all on function public.delete_own_account_data() from public;
grant execute on function public.delete_own_account_data() to authenticated;
