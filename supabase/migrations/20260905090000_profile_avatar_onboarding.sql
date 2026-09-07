-- Thrill Mill Club — profile avatar + onboarding tracking
--
-- avatar_url: public URL of the user's uploaded avatar (Storage bucket below).
-- onboarded_at: set once the user completes or explicitly skips profile
-- setup, so the onboarding screen isn't shown again on every login. Kept
-- separate from full_name so "skipped" is an explicit, queryable state
-- rather than being inferred from an empty string.

alter table public.profiles
  add column avatar_url text,
  add column onboarded_at timestamptz;

-- profiles_update_self (existing RLS policy) already covers these new
-- columns — it's a row-level policy, not column-scoped, and only
-- platform_role is separately guarded (trg_profiles_protect_role).

-- ----------------------------------------------------------------------------
-- Storage: avatars bucket
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', false)
on conflict (id) do nothing;

-- Any signed-in user can view any avatar (avatars aren't sensitive financial
-- data, unlike the rest of this schema — a simplification worth revisiting
-- if that assumption changes). Uploads/updates/deletes are restricted to the
-- owner's own folder, keyed by their user id as the first path segment
-- (e.g. "<user_id>/avatar.jpg").

create policy avatars_authenticated_read on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

create policy avatars_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
