-- Wanderlens — self-repair for a signed-in account with no profile row
--
-- Every account normally gets its profiles row from the handle_new_user
-- trigger at signup. If that row is ever missing (the trigger failed, or it
-- was deleted by hand), the app used to get stuck on onboarding forever:
-- onboarding saves with an UPDATE, which silently matches zero rows, so the
-- profile never appears and the guard never lets the user through.
--
-- ensure_my_profile() recreates the row for the CALLER only, from the same
-- signup metadata the trigger uses. AuthProvider calls it when a signed-in
-- user's profile comes back empty. SECURITY DEFINER because profiles has no
-- client INSERT policy (rows are only ever created server-side); it can
-- only ever act on auth.uid(), so there's nothing a caller can point at
-- another account.

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

  -- Deleted accounts keep their (anonymized) profile row, so they never get
  -- here; this also refuses to recreate one for a soft-deleted login.
  select lower(trim(u.raw_user_meta_data->>'username')), u.raw_user_meta_data->>'full_name'
    into v_username, v_full_name
  from auth.users u
  where u.id = v_uid and u.deleted_at is null;
  if not found then
    return false;
  end if;

  -- If the signup username is missing or has since been taken, fall back to
  -- a unique placeholder; the user can change it in Edit Profile.
  if v_username is null or v_username = ''
     or exists (select 1 from profiles where username = v_username) then
    v_username := 'traveler_' || substring(v_uid::text, 1, 8);
  end if;

  insert into profiles (id, username, full_name)
  values (v_uid, v_username, v_full_name)
  on conflict (id) do nothing;
  return true;
end;
$$;

revoke execute on function public.ensure_my_profile() from public, anon;
grant execute on function public.ensure_my_profile() to authenticated;
