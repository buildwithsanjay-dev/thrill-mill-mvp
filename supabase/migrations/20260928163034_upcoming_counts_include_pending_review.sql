-- Ripple-effect fix from the PENDING_REVIEW change (2026-09-28): a Host/
-- Co-host's own booking now starts as PENDING_REVIEW, but this counter still
-- only counted 'CONFIRMED' as "upcoming" -- so right after booking, the
-- customer's Team page showed 0 upcoming games and no card at all, until an
-- Admin approved it. A booking awaiting review is still something the Team
-- has coming up; it just isn't final yet (the client shows it labelled
-- "Pending Approval", not "Confirmed" -- see TeamDetailsScreen.tsx).

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
      where b.status in ('CONFIRMED', 'PENDING_REVIEW')
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
    and (public.fn_is_team_member(p_team_id) or public.fn_is_admin());
$fn$;

revoke all on function public.fn_get_team_booking_counts(uuid) from public, anon;
grant execute on function public.fn_get_team_booking_counts(uuid) to authenticated;
