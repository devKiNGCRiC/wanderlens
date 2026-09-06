-- Wanderlens — RLS audit fix #3
--
-- is_conversation_member(uuid), the security-definer helper every chat RLS
-- policy and RPC relies on (conversation_members/conversations SELECT,
-- messages INSERT, message_attachments/message_reactions, get_conversation_*
-- RPCs), only checked that a membership row exists — it never excluded
-- status = 'left'. That meant "Leave group" and "Delete chat" only hid the
-- conversation from list_conversations; anyone who retained the
-- conversation id (bookmarked, deep-linked, browser history) kept full read
-- and write access forever. 'request' status is deliberately still treated
-- as a member here — a pending message-request recipient must still be able
-- to receive/read messages for that flow to work; only 'left' is excluded.
--
-- No signature/return-type change, so a plain create or replace is
-- sufficient (per this project's own documented Postgres convention, a
-- drop-first is only required when return columns change).

create or replace function public.is_conversation_member(conv_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv_id and user_id = auth.uid() and status <> 'left'
  );
$$;
