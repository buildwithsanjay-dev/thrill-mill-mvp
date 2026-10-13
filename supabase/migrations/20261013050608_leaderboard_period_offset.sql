-- Adds a period offset to fn_leaderboard_live so the Leaderboard screen can
-- step back through past weeks/months (0 = current, 1 = previous, 2 = the
-- one before that, ...), not just the current live period. Appended as a
-- trailing optional parameter so every existing call site (which never
-- passes p_offset) keeps behaving exactly as before.
create or replace function public.fn_leaderboard_live(p_scope text, p_period text, p_offset integer default 0)
returns table(rank_no bigint, subject_id uuid, display_name text, avatar_url text, metric_value numeric, period_start date, period_end date)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_start date;
  v_end date;
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
  elsif p_period = 'MONTH' then
    v_start := (date_trunc('month', current_date) - (p_offset * interval '1 month'))::date;
    v_end := (v_start + interval '1 month - 1 day')::date;
  else
    raise exception 'INVALID_PERIOD' using errcode = '22023';
  end if;

  perform public.fn_auto_complete_past_bookings();

  if p_scope = 'TEAM' then
    return query
      select rank() over (order by count(*) desc), t.id, t.name, null::text,
             count(*)::numeric, v_start, v_end
        from public.bookings b
        join public.teams t on t.id = b.team_id
        where b.status = 'COMPLETED' and b.booking_date between v_start and v_end
        group by t.id, t.name
        order by count(*) desc;
  else
    return query
      select rank() over (order by sum(mua.credits_attributed) desc), p.id, p.full_name, p.avatar_url,
             sum(mua.credits_attributed), v_start, v_end
        from public.member_usage_attribution mua
        join public.bookings b on b.id = mua.booking_id
        join public.profiles p on p.id = mua.user_id
        where b.status = 'COMPLETED' and b.booking_date between v_start and v_end
        group by p.id, p.full_name, p.avatar_url
        order by sum(mua.credits_attributed) desc;
  end if;
end;
$function$;
