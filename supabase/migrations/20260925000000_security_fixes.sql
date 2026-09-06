-- Wanderlens — RLS audit fixes
--
-- 1. CRITICAL: conversation_members' "members can update their own
--    membership row" policy (chat_phase1) is correctly scoped by ROW
--    (user_id = auth.uid()) but was never scoped by COLUMN — any member
--    could directly `update conversation_members set role = 'admin'` on
--    their own row, bypassing every admin-gated RPC (add/remove members,
--    rename the group, set the avatar) entirely. The policy's row-level
--    logic is correct and stays as-is; this closes the gap with a
--    column-level grant, which is the idiomatic Postgres fix for
--    "some columns of an otherwise-legitimate self-update should not be
--    self-settable." Admin changes still happen exclusively through the
--    existing security-definer group RPCs.
--
-- 2. MEDIUM: message_reactions' INSERT policy (chat_phase2) checks
--    conversation membership but — unlike the messages INSERT policy in
--    that same migration — never added the blocked-pair guard. A user
--    blocked from sending new messages in a 1:1 thread could still react
--    to the other person's existing messages there. Mirrors the exact
--    check already used for messages.

revoke update on public.conversation_members from authenticated;
grant update (status, last_read_at, is_pinned, is_muted, is_favorite, is_archived, cleared_at)
  on public.conversation_members to authenticated;

drop policy if exists "members can react to messages in their conversations" on public.message_reactions;
create policy "members can react to messages in their conversations"
  on public.message_reactions for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.messages m
      where m.id = message_reactions.message_id
        and public.is_conversation_member(m.conversation_id)
        and not exists (
          select 1 from public.conversation_members cm
          where cm.conversation_id = m.conversation_id
            and cm.user_id <> auth.uid()
            and public.is_blocked(auth.uid(), cm.user_id)
        )
    )
  );
