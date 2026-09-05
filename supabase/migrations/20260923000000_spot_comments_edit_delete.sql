-- Wanderlens — allow editing/deleting spot_comments
-- spot_comments was built with SELECT + INSERT policies only (no edit/delete
-- UI existed until now). Idempotent — safe even if a policy with this exact
-- name already exists.

do $$ begin
  create policy "users can update their own comments"
    on public.spot_comments for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$ begin
  create policy "comment author or spot owner can delete a comment"
    on public.spot_comments for delete
    using (
      user_id = auth.uid()
      or exists (
        select 1 from public.spots s
        where s.id = spot_comments.spot_id and s.created_by = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;
