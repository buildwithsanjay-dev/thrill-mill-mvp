-- Weekly leaderboard result notifications (owner request, 2026-10-13).
--
-- Fires once a week, shortly after the new week starts, celebrating LAST
-- week's final standings: the top 3 individual members (fn_leaderboard_live
-- scope MEMBER) and the Host of the #1 Team (scope TEAM). Reuses
-- fn_leaderboard_live's existing WEEK period/offset math instead of the
-- legacy fn_compute_weekly_leaderboard snapshot table, so "last week" here
-- is exactly what the Leaderboard screen itself would show for offset=1 at
-- that moment -- no separate aggregation logic to keep in sync, and ties
-- (multiple subjects sharing rank 1) each get notified, same as the screen
-- would show them tied.
--
-- The client shows these as a one-time AppDialog pop-up (mascot + message)
-- on next app open, not just a bell/push row -- see
-- mobile/src/components/WeeklyResultPopup.tsx. read_at doubles as "already
-- shown", same as every other notification row; no new column needed.
create or replace function public.fn_send_weekly_leaderboard_results()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member record;
  v_team record;
  v_host record;
  v_count integer := 0;
begin
  for v_member in
    select * from public.fn_leaderboard_live('MEMBER', 'WEEK', 1) where rank_no <= 3
  loop
    perform public.fn_send_push_notification(
      v_member.subject_id,
      'WEEKLY_LEADERBOARD_RANK' || v_member.rank_no,
      case v_member.rank_no
        when 1 then 'You topped last week''s leaderboard!'
        when 2 then 'You placed #2 last week!'
        else 'You placed #3 last week!'
      end,
      case v_member.rank_no
        when 1 then 'You led the weekly leaderboard. Keep up the great play!'
        when 2 then 'So close to the top -- great game last week!'
        else 'You made the top 3 last week. Nice work!'
      end,
      jsonb_build_object('rank', v_member.rank_no, 'week_start', v_member.period_start, 'week_end', v_member.period_end)
    );
    v_count := v_count + 1;
  end loop;

  for v_team in
    select * from public.fn_leaderboard_live('TEAM', 'WEEK', 1) where rank_no = 1
  loop
    for v_host in
      select user_id from public.team_members
      where team_id = v_team.subject_id and team_role = 'HOST' and status = 'ACTIVE'
    loop
      perform public.fn_send_push_notification(
        v_host.user_id,
        'WEEKLY_TEAM_LEAD',
        'Your Team led last week!',
        v_team.display_name || ' topped last week''s Team leaderboard. Nice work leading them there!',
        jsonb_build_object('team_id', v_team.subject_id, 'week_start', v_team.period_start, 'week_end', v_team.period_end)
      );
      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke execute on function public.fn_send_weekly_leaderboard_results() from public, anon, authenticated;

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'weekly-leaderboard-results') then
    perform cron.unschedule('weekly-leaderboard-results');
  end if;
end $$;

-- Monday 00:30 UTC = 06:00 IST -- safely past midnight in both UTC and IST,
-- so fn_leaderboard_live's bare `current_date` (no explicit IST conversion,
-- matching its own existing convention) has already rolled over to the new
-- week in both timezones before "last week" is computed.
select cron.schedule(
  'weekly-leaderboard-results',
  '30 0 * * 1',
  $$select public.fn_send_weekly_leaderboard_results();$$
);
