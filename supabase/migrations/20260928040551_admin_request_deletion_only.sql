-- Owner feedback (2026-09-28): an Admin tapping "Delete account" was able to
-- instantly anonymise and lock themselves out of their own login, in one tap,
-- with no in-app recovery path -- exactly the kind of situation that took a
-- manual database script to unwind for a test account this same week. Admins
-- keep every other self-service ability; this narrows just the destructive
-- self-delete step to a logged REQUEST instead, so a human (the developer,
-- or another Admin reading the audit trail) completes it deliberately.
--
-- fn_delete_my_account itself is UNCHANGED and still fully callable (it's
-- still how the very first Admin, or a developer acting directly, actually
-- removes an Admin account) -- only the app's own Admin-facing button now
-- calls this instead of that.

create or replace function public.fn_request_admin_account_deletion(
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED' using errcode = '42501';
  end if;
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, reason, before_state, after_state)
  values
    (v_uid, 'ADMIN_ACCOUNT_DELETION_REQUESTED', 'profile', v_uid, p_reason,
     jsonb_build_object('platform_role', 'ADMIN'),
     jsonb_build_object('note', 'Deletion requested -- not yet acted on'));
end;
$$;

revoke execute on function public.fn_request_admin_account_deletion(text) from public, anon;
grant execute on function public.fn_request_admin_account_deletion(text) to authenticated;
