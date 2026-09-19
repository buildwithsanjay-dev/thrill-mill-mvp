-- Owner bug report (2026-09-22): signed in as Admin, the customer's team-invite
-- and poll notifications showed up, opened a customer page, and never cleared.
--
-- Two causes, one fix each on the server side (the app fixes the third — its
-- notifications query never said "only mine" — separately):
--
-- 1. A push token identifies a DEVICE, not a person. When two accounts were
--    signed in on the same phone (Admin + a customer), both profile rows held
--    the same token, so a customer's push landed on the phone while the Admin
--    was signed in. Now a token can belong to only one profile at a time: the
--    moment a profile takes a token, every other profile loses it. (Existing
--    duplicates are cleaned up below — most recently active profile keeps it.)
-- 2. Each push now carries who it was for (recipient_id) and its in-app row id
--    (notification_id), so the app can ignore a push meant for another account
--    and mark the right row read when a push is tapped.

-- 1a. clean up existing duplicates: keep the most recently updated profile
update public.profiles p
set expo_push_token = null
where p.expo_push_token is not null
  and exists (
    select 1 from public.profiles q
    where q.expo_push_token = p.expo_push_token
      and (q.updated_at > p.updated_at or (q.updated_at = p.updated_at and q.id > p.id))
  );

-- 1b. from now on a token belongs to one profile only
create or replace function public.tg_profiles_unique_push_token()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
    set expo_push_token = null
    where expo_push_token = new.expo_push_token and id <> new.id;
  return new;
end;
$$;

drop trigger if exists trg_profiles_unique_push_token on public.profiles;
create trigger trg_profiles_unique_push_token
  before update of expo_push_token on public.profiles
  for each row
  when (new.expo_push_token is not null and new.expo_push_token is distinct from old.expo_push_token)
  execute function public.tg_profiles_unique_push_token();

revoke execute on function public.tg_profiles_unique_push_token() from public, anon, authenticated;

-- 2. push payload carries recipient_id + notification_id
create or replace function public.fn_send_push_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_id uuid;
begin
  insert into public.notifications (user_id, type, title, body, data)
  values (p_user_id, p_type, p_title, p_body, p_data)
  returning id into v_id;

  select expo_push_token into v_token from public.profiles where id = p_user_id;
  if v_token is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
    body := jsonb_build_object(
      'to', v_token,
      'title', p_title,
      'body', p_body,
      'data', p_data || jsonb_build_object('recipient_id', p_user_id, 'notification_id', v_id),
      'sound', 'default',
      'priority', 'high',
      'channelId', 'default'
    )
  );
exception when others then
  raise warning 'fn_send_push_notification failed for user %, type %: %', p_user_id, p_type, sqlerrm;
end;
$$;

revoke all on function public.fn_send_push_notification(uuid, text, text, text, jsonb) from public, anon, authenticated;
