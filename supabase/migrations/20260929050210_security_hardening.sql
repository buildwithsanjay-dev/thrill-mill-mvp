-- Owner-requested backend security check (2026-09-29). Findings from
-- Supabase's own security advisor, verified individually before acting:
--
-- 1. Two functions were missing `set search_path` -- every other function in
--    this codebase pins it, these two were stragglers. Neither is SECURITY
--    DEFINER, so the real exploitability was low, but pinning it matches the
--    established convention and closes the gap for good.
-- 2. Six of our own trigger functions showed as "callable by anon/
--    authenticated" via PostgREST. Verified this is NOT actually exploitable
--    -- Postgres itself refuses to run a `returns trigger` function outside
--    an actual trigger context ("trigger functions can only be called as
--    triggers") -- but revoking EXECUTE anyway removes the exposed-looking
--    RPC endpoint entirely, as defense-in-depth.
--
-- NOT touched, and why:
--  - `rls_auto_enable()` (event trigger, auto-enables RLS on new tables) is
--    Supabase-platform-injected, not defined in any of our own migrations --
--    same "can't be called directly" protection applies (event trigger
--    functions have the same restriction), and it's not ours to manage.
--  - `pg_net` "installed in public schema" is Supabase's own default when
--    the extension is enabled via their dashboard; moving it risks breaking
--    the exact push-notification path (`net.http_post` in
--    fn_send_push_notification) this same check was asked to verify works.
--  - Leaked-password protection (HaveIBeenPwned check) is a Supabase Auth
--    dashboard toggle, not a database object -- can't be applied via SQL.
--  - The ~63 "authenticated can execute" RPC functions are the intended
--    architecture (CLAUDE.md: server-authoritative, each RPC checks its own
--    authorization internally via fn_is_admin()/fn_is_team_host_or_cohost()/
--    auth.uid() -- spot-checked fn_get_team_roster and the join-flow
--    functions directly and confirmed this).

create or replace function public.tg_profiles_validate_phone()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.phone is not null and btrim(new.phone) = '' then
    new.phone := null;
  end if;
  if new.phone is not null
     and (tg_op = 'INSERT' or new.phone is distinct from old.phone)
     and new.phone !~ '^\+91[6-9][0-9]{9}$' then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function public.fn_fmt_when(p_date date, p_time time)
returns text
language sql
stable
set search_path = public
as $$
  select to_char(p_date, 'Dy DD Mon') || ' at ' || to_char(p_time, 'FMHH12:MI AM');
$$;

revoke all on function public.tg_notify_admin_booking_confirmed() from public, anon, authenticated;
revoke all on function public.tg_notify_booking_cancelled() from public, anon, authenticated;
revoke all on function public.tg_notify_membership_requested() from public, anon, authenticated;
revoke all on function public.tg_notify_participant_added() from public, anon, authenticated;
revoke all on function public.tg_notify_team_member_change() from public, anon, authenticated;
revoke all on function public.tg_teams_name_guard() from public, anon, authenticated;
