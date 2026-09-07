-- Admin-only revenue analytics — real aggregation across payments/bookings,
-- computed server-side (per CLAUDE.md: "beyond a trivial RLS-scoped select"
-- goes through an RPC, not client-side aggregation over raw rows).
--
-- Revenue (money collected, INR) and credits consumed (an internal usage
-- unit) are deliberately kept as two separate figures in the response —
-- they are not the same number and must never be conflated in the UI.
--
-- Dates use Asia/Kolkata (matching fn_cancel_booking's 24h server-time rule)
-- and are anchored on when an event actually happened — payments.verified_at
-- for revenue, bookings.confirmed_at for consumption/booking-count trend —
-- not booking_date, which is the (possibly future) session date and would
-- misrepresent "activity" as happening on the day the Turf is played rather
-- than the day the booking/payment was made.

create or replace function public.fn_admin_revenue_analytics(p_days integer default 30)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_days integer := greatest(1, least(coalesce(p_days, 30), 365));
  v_end date := (now() at time zone 'Asia/Kolkata')::date;
  v_start date := v_end - (v_days - 1);
  v_week_start date := v_end - 6;
  v_prev_week_start date := v_end - 13;
  v_prev_week_end date := v_end - 7;
  v_daily jsonb;
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  with days as (
    select generate_series(v_start, v_end, interval '1 day')::date as day
  ),
  daily_revenue as (
    select (p.verified_at at time zone 'Asia/Kolkata')::date as day,
           sum(p.amount_inr) as revenue_inr
      from public.payments p
     where p.status = 'VERIFIED'
       and p.verified_at is not null
       and (p.verified_at at time zone 'Asia/Kolkata')::date between v_start and v_end
     group by 1
  ),
  daily_bookings as (
    select (b.confirmed_at at time zone 'Asia/Kolkata')::date as day,
           count(*) as bookings_count,
           sum(b.total_credits) as credits_consumed
      from public.bookings b
     where b.status in ('CONFIRMED', 'COMPLETED')
       and b.confirmed_at is not null
       and (b.confirmed_at at time zone 'Asia/Kolkata')::date between v_start and v_end
     group by 1
  )
  select jsonb_agg(
           jsonb_build_object(
             'day', to_char(d.day, 'YYYY-MM-DD'),
             'revenue_inr', coalesce(dr.revenue_inr, 0),
             'credits_consumed', coalesce(db.credits_consumed, 0),
             'bookings_count', coalesce(db.bookings_count, 0)
           )
           order by d.day
         )
    into v_daily
    from days d
    left join daily_revenue dr on dr.day = d.day
    left join daily_bookings db on db.day = d.day;

  return jsonb_build_object(
    'period_days', v_days,
    'range_start', to_char(v_start, 'YYYY-MM-DD'),
    'range_end', to_char(v_end, 'YYYY-MM-DD'),
    'summary', jsonb_build_object(
      -- All-time totals: real money collected vs. internal-credit usage volume.
      'total_revenue_inr', (
        select coalesce(sum(amount_inr), 0) from public.payments where status = 'VERIFIED'
      ),
      'total_credits_consumed', (
        select coalesce(sum(total_credits), 0) from public.bookings where status in ('CONFIRMED', 'COMPLETED')
      ),
      'total_bookings', (
        select count(*) from public.bookings where status in ('CONFIRMED', 'COMPLETED')
      ),
      'active_memberships', (
        select count(*) from public.team_memberships where status = 'ACTIVE'
      ),
      -- Week-over-week booking volume, keyed on the session date (booking_date)
      -- since "this week" / "last week" here means the Turf calendar week, not
      -- when the booking was made.
      'bookings_this_week', (
        select count(*) from public.bookings
         where status in ('CONFIRMED', 'COMPLETED') and booking_date between v_week_start and v_end
      ),
      'bookings_last_week', (
        select count(*) from public.bookings
         where status in ('CONFIRMED', 'COMPLETED') and booking_date between v_prev_week_start and v_prev_week_end
      ),
      -- Totals scoped to the requested trend window, for context alongside `daily`.
      'period_revenue_inr', (
        select coalesce(sum(amount_inr), 0) from public.payments
         where status = 'VERIFIED' and verified_at is not null
           and (verified_at at time zone 'Asia/Kolkata')::date between v_start and v_end
      ),
      'period_credits_consumed', (
        select coalesce(sum(total_credits), 0) from public.bookings
         where status in ('CONFIRMED', 'COMPLETED') and confirmed_at is not null
           and (confirmed_at at time zone 'Asia/Kolkata')::date between v_start and v_end
      ),
      'period_bookings_count', (
        select count(*) from public.bookings
         where status in ('CONFIRMED', 'COMPLETED') and confirmed_at is not null
           and (confirmed_at at time zone 'Asia/Kolkata')::date between v_start and v_end
      )
    ),
    'daily', coalesce(v_daily, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.fn_admin_revenue_analytics(integer) from public, anon;
grant execute on function public.fn_admin_revenue_analytics(integer) to authenticated;
