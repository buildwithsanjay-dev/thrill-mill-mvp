-- Team banner: each Team can have its own banner image, shown on Team
-- Details. Edit access is Host-only (not Co-host, not a plain member) — a
-- deliberate narrower rule than most other Team-management actions in this
-- schema, which are usually Host-or-Co-host. Admin can also set it, same
-- "Admin can do everything a Host can" principle used everywhere else.
--
-- Follows the exact avatars-bucket pattern (20260905090000/090100): a
-- public bucket (banners aren't sensitive data, and getPublicUrl() needs a
-- public bucket to resolve without an auth header), path-prefixed by
-- <team_id>/..., broad authenticated read, narrow write.
--
-- Storage RLS can't reference "am I this Team's Host" via a simple string
-- match the way avatars_owner_* does (auth.uid() against the path prefix)
-- since the path prefix here is a team_id, not a user_id — so the write
-- policies subquery team_members instead.

alter table public.teams add column banner_url text;

insert into storage.buckets (id, name, public)
values ('team-banners', 'team-banners', true)
on conflict (id) do nothing;

create policy team_banners_authenticated_read on storage.objects
  for select to authenticated
  using (bucket_id = 'team-banners');

create policy team_banners_host_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'team-banners'
    and (
      public.fn_is_admin()
      or exists (
        select 1 from public.team_members tm
        where tm.team_id = ((storage.foldername(name))[1])::uuid
          and tm.user_id = (select auth.uid())
          and tm.status = 'ACTIVE'
          and tm.team_role = 'HOST'
      )
    )
  );

create policy team_banners_host_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'team-banners'
    and (
      public.fn_is_admin()
      or exists (
        select 1 from public.team_members tm
        where tm.team_id = ((storage.foldername(name))[1])::uuid
          and tm.user_id = (select auth.uid())
          and tm.status = 'ACTIVE'
          and tm.team_role = 'HOST'
      )
    )
  )
  with check (
    bucket_id = 'team-banners'
    and (
      public.fn_is_admin()
      or exists (
        select 1 from public.team_members tm
        where tm.team_id = ((storage.foldername(name))[1])::uuid
          and tm.user_id = (select auth.uid())
          and tm.status = 'ACTIVE'
          and tm.team_role = 'HOST'
      )
    )
  );

create policy team_banners_host_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'team-banners'
    and (
      public.fn_is_admin()
      or exists (
        select 1 from public.team_members tm
        where tm.team_id = ((storage.foldername(name))[1])::uuid
          and tm.user_id = (select auth.uid())
          and tm.status = 'ACTIVE'
          and tm.team_role = 'HOST'
      )
    )
  );

-- ============================================================================
-- fn_set_team_banner — Host-only (or Admin) write to teams.banner_url.
-- teams has no direct client UPDATE policy at all (every write is RPC-only,
-- per the existing pattern) — this is deliberately narrower than the
-- Host-or-Co-host rule most other Team-management RPCs use.
-- ============================================================================

create or replace function public.fn_set_team_banner(
  p_team_id uuid,
  p_banner_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.fn_is_admin()
    or public.fn_team_role(p_team_id) = 'HOST'
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.teams set banner_url = p_banner_url where id = p_team_id;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.fn_set_team_banner(uuid, text) from public, anon;
grant execute on function public.fn_set_team_banner(uuid, text) to authenticated;
