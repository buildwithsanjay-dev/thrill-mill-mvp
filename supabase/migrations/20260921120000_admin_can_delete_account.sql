-- Owner request (2026-09-21): the Admin account also needs "Delete account".
--
-- Replaces fn_delete_my_account (20260919120000) so an Admin may delete their
-- own account, with three safeguards a normal member doesn't need:
--   1. LAST_ADMIN — the only remaining Admin can't delete themselves, or
--      nobody could verify payments / run the club any more.
--   2. Demoted to MEMBER in the same step. A deleted Admin's sign-in token
--      stays technically valid for up to an hour after sessions are killed;
--      without the demotion it would keep Admin powers (fn_is_admin() reads
--      profiles.platform_role) for that hour.
--   3. Audited: a sensitive Admin action must produce an admin_audit_logs
--      entry (CLAUDE.md), written BEFORE the profile is anonymised.
-- Everything else is unchanged: the profile is anonymised, never hard-deleted,
-- so wallet / booking / audit history that references it is preserved.

create or replace function public.fn_delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_draft record;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;

  select (platform_role = 'ADMIN') into v_is_admin from public.profiles where id = v_uid;

  if v_is_admin and not exists (
    select 1 from public.profiles where platform_role = 'ADMIN' and id <> v_uid
  ) then
    raise exception 'LAST_ADMIN' using errcode = '22023';
  end if;

  -- Unfinished Team drafts (never reached a membership request) vanish with
  -- the account, same rule as fn_abandon_team_creation.
  for v_draft in
    select t.id from public.teams t
    where t.created_by = v_uid and t.status = 'CREATED'
      and not exists (select 1 from public.team_memberships tm where tm.team_id = t.id)
  loop
    delete from public.teams where id = v_draft.id;
  end loop;

  if exists (
    select 1 from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.user_id = v_uid and tm.team_role = 'HOST' and tm.status = 'ACTIVE'
      and t.status <> 'ARCHIVED'
  ) then
    raise exception 'HOST_MUST_TRANSFER' using errcode = '22023';
  end if;

  if v_is_admin then
    insert into public.admin_audit_logs
      (admin_id, action, target_type, target_id, reason, before_state, after_state)
    values
      (v_uid, 'ADMIN_ACCOUNT_DELETED', 'profile', v_uid, 'Self-service account deletion',
       jsonb_build_object('platform_role', 'ADMIN'),
       jsonb_build_object('platform_role', 'MEMBER', 'anonymised', true));
  end if;

  update public.team_members
    set status = 'LEFT', removed_at = now()
    where user_id = v_uid and status in ('ACTIVE', 'PENDING', 'INVITED');

  update public.chat_messages set is_deleted = true where sender_id = v_uid;
  delete from public.chat_message_reactions where user_id = v_uid;
  delete from public.chat_room_reads where user_id = v_uid;
  delete from public.notifications where user_id = v_uid;

  -- One statement: anonymise AND (for an Admin) demote. The role-protection
  -- trigger allows it because the caller is still an Admin at this instant.
  update public.profiles
    set full_name = 'Deleted user',
        phone = null,
        avatar_url = null,
        expo_push_token = null,
        platform_role = 'MEMBER'
    where id = v_uid;

  -- Revoke sign-in: drop identities, kill sessions, scrub contact details and
  -- ban the auth user.
  delete from auth.identities where user_id = v_uid;
  delete from auth.sessions where user_id = v_uid;
  update auth.users
    set email = 'deleted-' || v_uid || '@deleted.invalid',
        phone = null,
        raw_user_meta_data = '{}'::jsonb,
        raw_app_meta_data = '{}'::jsonb,
        banned_until = now() + interval '100 years'
    where id = v_uid;
end;
$$;

revoke execute on function public.fn_delete_my_account() from public, anon;
grant execute on function public.fn_delete_my_account() to authenticated;
