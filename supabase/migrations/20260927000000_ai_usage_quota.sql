-- Wanderlens — per-user AI quota, backing the generate-trail / generate-caption
-- Edge Functions.
--
-- Context: lib/ai.ts previously called Groq and Gemini directly from the client
-- with EXPO_PUBLIC_* keys (see ROADMAP.md "Known, accepted simplification").
-- Both calls now go through Edge Functions that hold the real keys. This
-- migration is the rate limit those functions enforce.
--
-- Design notes worth not re-deriving later:
--
-- 1. The Edge Functions authenticate with the ANON key plus the caller's own
--    forwarded JWT — no service-role key exists anywhere in this feature. That
--    means the function executes AS THE CALLER. Every privilege granted here is
--    therefore also granted to the app, and to anyone holding the anon key.
--
-- 2. Consequence of (1): there is deliberately NO refund/delete path. If a user
--    could delete their own ai_usage rows they could wipe their own quota, and
--    the SELECT policy below hands them the row ids. So a failed Groq/Gemini
--    call still counts against the quota. That is the intended trade — the
--    alternative is introducing a service-role secret, which is exactly what
--    this whole change exists to avoid. Limits are set generously to compensate.
--
-- 3. consume_ai_quota is security definer and is the ONLY write path. insert /
--    update / delete are revoked from authenticated and anon, so the table is
--    structurally unforgeable rather than merely policy-protected.
--
-- 4. The advisory lock is load-bearing, not decoration. Two Edge Function
--    isolates are two independent transactions; without it both can read
--    count = limit - 1 and both insert.
--
-- 5. The limits live here in SQL, not in the Edge Function, on purpose: tuning
--    one is a one-line migration pasted into the SQL editor, with no
--    `supabase functions deploy`.

-- ============================================================
-- Table
-- ============================================================

create table if not exists public.ai_usage (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  feature    text not null,
  created_at timestamptz not null default now()
);

alter table public.ai_usage drop constraint if exists ai_usage_feature_check;
alter table public.ai_usage add constraint ai_usage_feature_check
  check (feature in ('trail', 'caption'));

-- Serves the only query the quota function runs.
create index if not exists ai_usage_user_feature_time_idx
  on public.ai_usage (user_id, feature, created_at desc);

-- ============================================================
-- RLS
-- ============================================================

alter table public.ai_usage enable row level security;

-- Read-only, own rows only — useful for debugging and for a future
-- "3 of 10 generations left" affordance. Safe precisely because there is no
-- delete path (see note 2 above).
do $$ begin
  create policy "users can view their own ai usage"
    on public.ai_usage for select
    using (user_id = auth.uid());
exception when duplicate_object then null;
end $$;

-- Supabase grants all on new public tables to anon/authenticated by default.
-- RLS with no matching policy would already deny these, but be explicit.
revoke insert, update, delete on public.ai_usage from authenticated, anon;

-- ============================================================
-- consume_ai_quota — atomic check-and-reserve
-- ============================================================

drop function if exists public.consume_ai_quota(text);
create or replace function public.consume_ai_quota(p_feature text)
returns table (
  allowed             boolean,
  used_in_window      int,
  limit_in_window     int,
  retry_after_seconds int
)
language plpgsql security definer set search_path = public
as $$
declare
  v_user           uuid := auth.uid();
  v_window_seconds int;
  v_window_limit   int;
  v_daily_limit    int;
  v_used_window    int;
  v_used_day       int;
  v_oldest_window  timestamptz;
  v_oldest_day     timestamptz;
  v_retry          int := 0;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  -- Quota policy. Trail is the expensive call (large prompt, 120B model);
  -- caption is one small image on a flash-lite model. Both windows are
  -- enforced because an hourly cap alone silently permits 24x per day.
  case p_feature
    when 'trail'   then v_window_seconds := 3600; v_window_limit := 10; v_daily_limit := 40;
    when 'caption' then v_window_seconds := 3600; v_window_limit := 25; v_daily_limit := 120;
    else raise exception 'Unknown AI feature: %', p_feature using errcode = '22023';
  end case;

  -- Serialise concurrent invocations for this (user, feature) for the rest of
  -- this transaction. Released automatically at commit. Different users never
  -- contend. This is what makes the count-then-insert below atomic.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_feature, 0));

  select
    count(*) filter (where created_at > now() - make_interval(secs => v_window_seconds)),
    count(*),
    min(created_at) filter (where created_at > now() - make_interval(secs => v_window_seconds)),
    min(created_at)
  into v_used_window, v_used_day, v_oldest_window, v_oldest_day
  from public.ai_usage
  where user_id = v_user
    and feature = p_feature
    and created_at > now() - interval '24 hours';

  if v_used_window >= v_window_limit then
    v_retry := ceil(extract(epoch from
      (v_oldest_window + make_interval(secs => v_window_seconds)) - now()))::int;
  elsif v_used_day >= v_daily_limit then
    v_retry := ceil(extract(epoch from
      (v_oldest_day + interval '24 hours') - now()))::int;
  end if;

  if v_retry > 0 then
    return query select false, v_used_window, v_window_limit, greatest(v_retry, 1);
    return;
  end if;

  -- Reserve BEFORE the vendor call. The Edge Function only reaches this point
  -- after validating its payload, so a malformed request never costs a slot.
  insert into public.ai_usage (user_id, feature) values (v_user, p_feature);

  return query select true, v_used_window + 1, v_window_limit, 0;
end;
$$;

revoke execute on function public.consume_ai_quota(text) from public, anon;
grant execute on function public.consume_ai_quota(text) to authenticated;
