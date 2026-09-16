-- Wanderlens — personal notes
--
-- Freeform private notes (title + body), optionally linked to a spot (e.g.
-- "camera settings that worked well here"). Purely personal — never shown
-- to other users, matching the same "personal utility" category as
-- saved_spots/trails, not a social/community feature.

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  -- set null (not cascade) on spot deletion — the note's content is the
  -- user's own, it shouldn't disappear just because the spot it referenced
  -- was later removed; it just becomes unlinked.
  spot_id uuid references public.spots(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notes_user_id_idx on public.notes(user_id);
create index if not exists notes_spot_id_idx on public.notes(spot_id) where spot_id is not null;

alter table public.notes enable row level security;

create policy "Users manage their own notes"
  on public.notes for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
