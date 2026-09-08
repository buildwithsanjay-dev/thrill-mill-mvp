-- fn_get_team_booking_counts — server-computed Upcoming/Games-Played counts
--
-- Both the member Team Details screen and the Admin Network Details screen
-- previously derived these counts client-side from booking.status alone
-- (status = 'CONFIRMED' -> "Upcoming", status = 'COMPLETED' -> "Games
-- Played"). That's wrong: nothing automatically flips a booking from
-- CONFIRMED to COMPLETED once its session start time passes (fn_complete_
-- booking is a separate, explicit Host/Co-host/Admin action) — so a played
-- game sitting in still-CONFIRMED status kept counting as "Upcoming"
-- forever, and "Games Played" never moved on its own.
--
-- This RPC buckets by server time (never device time, per CLAUDE.md):
--   upcoming_count: CONFIRMED bookings whose session start is still ahead.
--   played_count:   CONFIRMED bookings whose session start has passed,
--                    plus any already explicitly COMPLETED — a completed
--                    booking is unambiguously "played" regardless of which
--                    bucket its status literally sits in.
-- One query, one definition — both screens call the same RPC so their
-- numbers can never disagree.
create or replace function public.fn_get_team_booking_counts(p_team_id uuid)
returns table (
  upcoming_count integer,
  played_count integer
)
language sql
security definer
stable
set search_path = public
as $fn$
  select
    count(*) filter (
      where b.status = 'CONFIRMED'
        and (b.booking_date + b.start_time) at time zone 'Asia/Kolkata' > now()
    )::integer as upcoming_count,
    count(*) filter (
      where (
        b.status = 'COMPLETED'
        or (b.status = 'CONFIRMED' and (b.booking_date + b.start_time) at time zone 'Asia/Kolkata' <= now())
      )
    )::integer as played_count
  from public.bookings b
  where b.team_id = p_team_id
    -- Only a member of this Team (or an Admin) may read its booking
    -- counts — same isolation rule as every other per-Team read.
    and (public.fn_is_team_member(p_team_id) or public.fn_is_admin());
$fn$;

revoke all on function public.fn_get_team_booking_counts(uuid) from public, anon;
grant execute on function public.fn_get_team_booking_counts(uuid) to authenticated;
