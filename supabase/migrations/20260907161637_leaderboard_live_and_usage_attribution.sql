-- ----------------------------------------------------------------------------
-- Bug 6: Leaderboard week/month filters (Team + Member) + per-member credit
-- usage log, backed by `member_usage_attribution`.
--
-- `member_usage_attribution` is already written correctly by the existing
-- `fn_complete_booking` RPC (booking's total_credits / locked-participant
-- count, one row per participant, `on conflict (booking_id, user_id) do
-- nothing` for idempotency) — analytics only, never a Team-wallet split.
-- Nothing else in the schema calls that RPC yet though: there's no cron
-- (pg_cron isn't enabled on this project) and no client trigger, so a
-- CONFIRMED booking whose session has actually finished just sits there
-- forever unless a Host/Co-host/Admin happens to call fn_complete_booking
-- manually. That's the missing "transition to played" piece.
--
-- Rather than add a second, competing transition-detection mechanism, this
-- migration follows the exact "self-heal on read, server time only" pattern
-- already used by fn_create_slot_hold (which self-heals stale HELD slots
-- inline) and fn_expire_stale_holds (which sweeps stale slot_holds): a single
-- new fn_auto_complete_past_bookings() reuses fn_complete_booking's own
-- attribution math for every booking whose session has actually ended per
-- SERVER time, and it's invoked lazily wherever "played" state matters to a
-- read (here: the leaderboard and the member usage log), never from device
-- time.
--
-- `leaderboard_weekly` is a precomputed snapshot table only ever populated by
-- the Admin/cron-driven fn_compute_weekly_leaderboard RPC — since nothing
-- calls that automatically either, the table is empty and the leaderboard
-- screen would show "no data" forever for the current week even with real
-- completed bookings. fn_leaderboard_live() below computes current
-- Week (Mon-Sun) / Month standings on demand instead, so the leaderboard
-- always reflects real state for the current, possibly-partial period
-- without waiting on an Admin snapshot job. fn_compute_weekly_leaderboard
-- and leaderboard_weekly are left untouched for historical archiving.
-- ----------------------------------------------------------------------------

-- 1. Auto-complete bookings whose session has ended, server time, and write
--    member_usage_attribution for them (same math as fn_complete_booking).
create or replace function public.fn_auto_complete_past_bookings()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_booking record;
  v_participant_count integer;
  v_per_member_credits numeric(12,2);
  v_count integer := 0;
begin
  for v_booking in
    select *
      from public.bookings
      where status in ('CONFIRMED', 'IN_PROGRESS')
        and (booking_date + end_time) at time zone 'Asia/Kolkata' < now()
      for update skip locked
  loop
    update public.booking_participants
      set status = 'COMPLETED', locked_at = coalesce(locked_at, now())
      where booking_id = v_booking.id and status in ('SELECTED', 'LOCKED');

    select count(*) into v_participant_count
      from public.booking_participants
      where booking_id = v_booking.id and status = 'COMPLETED';

    -- A booking that somehow ended with zero locked participants still
    -- closes out (no participants to attribute credits to) rather than
    -- blocking every later booking in the loop.
    if v_participant_count > 0 then
      v_per_member_credits := round(v_booking.total_credits / v_participant_count, 2);

      insert into public.member_usage_attribution
        (booking_id, user_id, team_id, credits_attributed, participant_count_at_completion)
      select v_booking.id, bp.user_id, v_booking.team_id, v_per_member_credits, v_participant_count
        from public.booking_participants bp
        where bp.booking_id = v_booking.id and bp.status = 'COMPLETED'
      on conflict (booking_id, user_id) do nothing;
    end if;

    update public.bookings
      set status = 'COMPLETED', completed_at = now()
      where id = v_booking.id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

revoke execute on function public.fn_auto_complete_past_bookings() from public, anon;

-- 2. Live-computed Week/Month leaderboard (Team and Member scope), always
--    self-healing past-due bookings first so results reflect real state.
create or replace function public.fn_leaderboard_live(p_scope text, p_period text)
returns table (
  rank_no bigint,
  subject_id uuid,
  display_name text,
  avatar_url text,
  metric_value numeric,
  period_start date,
  period_end date
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_start date;
  v_end date;
begin
  if p_scope not in ('TEAM', 'MEMBER') then
    raise exception 'INVALID_SCOPE' using errcode = '22023';
  end if;

  -- Monday-Sunday week convention; date_trunc('week', ...) is ISO-8601
  -- (Monday-start) in Postgres.
  if p_period = 'WEEK' then
    v_start := date_trunc('week', current_date)::date;
    v_end := v_start + 6;
  elsif p_period = 'MONTH' then
    v_start := date_trunc('month', current_date)::date;
    v_end := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
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

revoke execute on function public.fn_leaderboard_live(text, text) from public, anon;

-- 3. Per-member credit-usage log for the Profile screen — the caller's own
--    member_usage_attribution rows only (never another member's), Week or
--    Month filtered, self-healing past-due bookings first for the same
--    reason as fn_leaderboard_live.
create or replace function public.fn_my_credit_usage_log(p_period text)
returns table (
  booking_id uuid,
  team_id uuid,
  team_name text,
  booking_date date,
  start_time time,
  end_time time,
  credits_attributed numeric,
  participant_count_at_completion integer
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_start date;
  v_end date;
begin
  if p_period = 'WEEK' then
    v_start := date_trunc('week', current_date)::date;
    v_end := v_start + 6;
  elsif p_period = 'MONTH' then
    v_start := date_trunc('month', current_date)::date;
    v_end := (date_trunc('month', current_date) + interval '1 month - 1 day')::date;
  else
    raise exception 'INVALID_PERIOD' using errcode = '22023';
  end if;

  perform public.fn_auto_complete_past_bookings();

  return query
    select mua.booking_id, mua.team_id, t.name, b.booking_date, b.start_time, b.end_time,
           mua.credits_attributed, mua.participant_count_at_completion
      from public.member_usage_attribution mua
      join public.bookings b on b.id = mua.booking_id
      join public.teams t on t.id = mua.team_id
      where mua.user_id = (select auth.uid())
        and b.booking_date between v_start and v_end
      order by b.booking_date desc, b.start_time desc;
end;
$function$;

revoke execute on function public.fn_my_credit_usage_log(text) from public, anon;
