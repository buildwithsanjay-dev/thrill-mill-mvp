-- Code-review finding: fn_send_push_notification's body was not defensively
-- wrapped, so an unexpected error inside it (most plausibly the
-- `insert into public.notifications`, since net.http_post's own enqueue is
-- very unlikely to fail under normal operation) would propagate up and
-- abort the ENTIRE calling transaction — the booking confirmation or
-- membership activation it's attached to — contradicting the fail-safe
-- design described when this was introduced. A notification/push failure
-- must never be able to block or fail the financial operation it rides
-- along with. Fixed by wrapping the whole body in exception handling.

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
begin
  insert into public.notifications (user_id, type, title, body, data)
  values (p_user_id, p_type, p_title, p_body, p_data);

  select expo_push_token into v_token from public.profiles where id = p_user_id;
  if v_token is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
    body := jsonb_build_object('to', v_token, 'title', p_title, 'body', p_body, 'data', p_data)
  );
exception when others then
  -- Best-effort by design: a notification/push failure (unexpected schema
  -- issue, pg_net hiccup, anything) must never abort the financial
  -- transaction this function is called from. Swallow and move on.
  raise warning 'fn_send_push_notification failed for user %, type %: %', p_user_id, p_type, sqlerrm;
end;
$$;

revoke all on function public.fn_send_push_notification(uuid, text, text, text, jsonb) from public, anon, authenticated;
