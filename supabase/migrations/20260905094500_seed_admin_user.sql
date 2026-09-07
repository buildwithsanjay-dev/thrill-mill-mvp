-- Seeds the platform's first Admin account as a real Supabase Auth
-- email/password user, then promotes its profiles row to platform_role
-- 'ADMIN'.
--
-- trg_profiles_protect_role normally requires the acting session to
-- already belong to an existing Admin, which makes a *first* admin
-- impossible to create through ordinary means. Rather than disabling that
-- trigger (which would blindly bypass the check for whatever else runs in
-- the same statement), this migration adds one narrow, permanent
-- exception to the trigger function itself: self-promotion is allowed
-- only while zero Admins exist anywhere yet. The moment any Admin exists,
-- this path closes forever and normal admin-must-approve-admin rules
-- apply to every future promotion.
--
-- Credential (per explicit user instruction, mobile app username/password
-- admin login maps "admin" -> this email):
--   email:    admin@thrillmillclub.internal
--   password: AdkTSS@2026
create or replace function public.tg_profiles_protect_role()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.platform_role is distinct from old.platform_role then
    if not exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.platform_role = 'ADMIN'
    ) and exists (
      select 1 from public.profiles p where p.platform_role = 'ADMIN'
    ) then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$fn$;

do $$
declare
  v_user_id uuid;
  v_email text := 'admin@thrillmillclub.internal';
begin
  select id into v_user_id from auth.users where email = v_email;

  if v_user_id is null then
    v_user_id := gen_random_uuid();

    -- confirmation_token/recovery_token/email_change_token_new/email_change
    -- must be '' rather than NULL: GoTrue's Go SQL driver scans these
    -- columns as non-nullable strings, and a NULL there produces a
    -- confusing "error finding user: converting NULL to string is
    -- unsupported" 500 at every future sign-in attempt for this user (only
    -- discovered because it actually broke admin login after this
    -- migration first ran without these).
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated', 'authenticated',
      v_email, crypt('AdkTSS@2026', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Admin"}'::jsonb,
      false, false,
      '', '', '', ''
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user_id, v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email),
      'email', now(), now(), now()
    );
  end if;

  -- handle_new_auth_user() trigger already provisioned the profiles row
  -- (or it existed already, if this migration re-runs). The trigger
  -- function's bootstrap exception (see above) allows this only because
  -- no Admin exists yet.
  update public.profiles
  set platform_role = 'ADMIN'
  where id = v_user_id and platform_role is distinct from 'ADMIN';
end $$;
