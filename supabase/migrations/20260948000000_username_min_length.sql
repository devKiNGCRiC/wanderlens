-- Wanderlens — usernames need at least 4 characters
--
-- 3-character handles are easy to confuse and to squat. The signup screen
-- and Edit Profile now ask for 4+, and the server enforces it so a direct
-- API call can't skip the rule.
--
-- Enforced with a trigger rather than a CHECK constraint on purpose: a few
-- existing accounts may already have a 3-character username, and a CHECK
-- (even NOT VALID) would reject every later update of those rows — e.g.
-- saving a new bio. The trigger only fires when the username itself is set
-- or changed, so existing handles keep working until their owner changes them.

create or replace function public.guard_username_length()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.username is not null
     and (tg_op = 'INSERT' or new.username is distinct from old.username)
     and char_length(new.username) < 4 then
    raise exception 'A username needs at least 4 characters.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_username_length on public.profiles;
create trigger profiles_guard_username_length
  before insert or update of username on public.profiles
  for each row execute function public.guard_username_length();

-- The live signup check agrees with the rule.
create or replace function public.is_username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Same normalisation the signup screen applies (trim + lower case).
  select char_length(trim(p_username)) >= 4
    and not exists (select 1 from profiles where username = lower(trim(p_username)));
$$;

-- Self-repair (20260946000000_ensure_my_profile.sql) must never trip the new
-- rule: an old signup with a 3-character username falls back to the
-- placeholder, like a taken one does.
create or replace function public.ensure_my_profile()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_username text;
  v_full_name text;
begin
  if v_uid is null then
    return false;
  end if;
  if exists (select 1 from profiles where id = v_uid) then
    return false;
  end if;

  select lower(trim(u.raw_user_meta_data->>'username')), u.raw_user_meta_data->>'full_name'
    into v_username, v_full_name
  from auth.users u
  where u.id = v_uid and u.deleted_at is null;
  if not found then
    return false;
  end if;

  if v_username is null or char_length(v_username) < 4
     or exists (select 1 from profiles where username = v_username) then
    v_username := 'traveler_' || substring(v_uid::text, 1, 8);
  end if;

  insert into profiles (id, username, full_name)
  values (v_uid, v_username, v_full_name)
  on conflict (id) do nothing;
  return true;
end;
$$;
