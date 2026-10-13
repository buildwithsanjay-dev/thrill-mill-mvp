-- Adds previous_rank_no to fn_leaderboard_live so the client can show
-- "stock-ticker" style rank movement (up/down + how many places) instead of
-- just a static position — computes the SAME ranking one period further
-- back (offset+1) and left-joins it onto the current ranking by subject.
-- previous_rank_no is null when the subject had no completed activity in
-- that earlier period at all (a genuinely new entrant to the board).
-- `create or replace function` cannot change an existing function's return
-- type (adding previous_rank_no to the TABLE(...) result counts as one) —
-- it must be dropped first, same lesson as the overload issue in
-- 20261013050803_leaderboard_period_offset_drop_old_overload.sql.
drop function if exists public.fn_leaderboard_live(text, text, integer);

create function public.fn_leaderboard_live(p_scope text, p_period text, p_offset integer default 0)
returns table(
  rank_no bigint,
  subject_id uuid,
  display_name text,
  avatar_url text,
  metric_value numeric,
  period_start date,
  period_end date,
  previous_rank_no bigint
)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_start date;
  v_end date;
  v_prev_start date;
  v_prev_end date;
begin
  if p_scope not in ('TEAM', 'MEMBER') then
    raise exception 'INVALID_SCOPE' using errcode = '22023';
  end if;

  if p_offset < 0 then
    raise exception 'INVALID_OFFSET' using errcode = '22023';
  end if;

  -- Monday-Sunday week convention; date_trunc('week', ...) is ISO-8601
  -- (Monday-start) in Postgres.
  if p_period = 'WEEK' then
    v_start := (date_trunc('week', current_date) - (p_offset * interval '7 days'))::date;
    v_end := v_start + 6;
    v_prev_start := v_start - 7;
    v_prev_end := v_prev_start + 6;
  elsif p_period = 'MONTH' then
    v_start := (date_trunc('month', current_date) - (p_offset * interval '1 month'))::date;
    v_end := (v_start + interval '1 month - 1 day')::date;
    v_prev_start := (v_start - interval '1 month')::date;
    v_prev_end := (v_prev_start + interval '1 month - 1 day')::date;
  else
    raise exception 'INVALID_PERIOD' using errcode = '22023';
  end if;

  perform public.fn_auto_complete_past_bookings();

  if p_scope = 'TEAM' then
    return query
      with current_period as (
        select t.id, t.name, count(*) as cnt
          from public.bookings b
          join public.teams t on t.id = b.team_id
         where b.status = 'COMPLETED' and b.booking_date between v_start and v_end
         group by t.id, t.name
      ),
      previous_ranked as (
        select t.id, rank() over (order by count(*) desc) as prank
          from public.bookings b
          join public.teams t on t.id = b.team_id
         where b.status = 'COMPLETED' and b.booking_date between v_prev_start and v_prev_end
         group by t.id
      )
      select rank() over (order by cp.cnt desc), cp.id, cp.name, null::text, cp.cnt::numeric,
             v_start, v_end, pr.prank
        from current_period cp
        left join previous_ranked pr on pr.id = cp.id
        order by cp.cnt desc;
  else
    return query
      with current_period as (
        select p.id, p.full_name, p.avatar_url, sum(mua.credits_attributed) as credits
          from public.member_usage_attribution mua
          join public.bookings b on b.id = mua.booking_id
          join public.profiles p on p.id = mua.user_id
         where b.status = 'COMPLETED' and b.booking_date between v_start and v_end
         group by p.id, p.full_name, p.avatar_url
      ),
      previous_ranked as (
        select p.id, rank() over (order by sum(mua.credits_attributed) desc) as prank
          from public.member_usage_attribution mua
          join public.bookings b on b.id = mua.booking_id
          join public.profiles p on p.id = mua.user_id
         where b.status = 'COMPLETED' and b.booking_date between v_prev_start and v_prev_end
         group by p.id
      )
      select rank() over (order by cp.credits desc), cp.id, cp.full_name, cp.avatar_url, cp.credits,
             v_start, v_end, pr.prank
        from current_period cp
        left join previous_ranked pr on pr.id = cp.id
        order by cp.credits desc;
  end if;
end;
$function$;

revoke all on function public.fn_leaderboard_live(text, text, integer) from public, anon;
