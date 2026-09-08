-- fn_auto_complete_past_bookings() (see 20260907161637_leaderboard_live_and_
-- usage_attribution.sql) already exists and does the right thing — it's only
-- ever invoked lazily, from fn_leaderboard_live/fn_my_credit_usage_log, so a
-- booking whose session has ended only actually flips CONFIRMED/IN_PROGRESS
-- -> COMPLETED (locking participants, writing member_usage_attribution) if
-- someone happens to open the Leaderboard or their Credit Usage log. Every
-- other screen (Dashboard's own Upcoming card, the "Other Networks'
-- Upcoming" strip, Team Details, Admin Bookings, Admin Home) reads
-- bookings.status directly via a plain PostgREST select, not through an RPC
-- that could "perform" the self-heal first — so those kept showing a played
-- game as still "Upcoming"/CONFIRMED indefinitely.
--
-- Rather than add yet another competing transition mechanism (the prior
-- migration was explicit about avoiding that), this schedules the *same*
-- fn_auto_complete_past_bookings() via pg_cron so it also runs unattended,
-- independent of any specific screen being opened. Once bookings.status
-- itself is correct, every existing plain-select screen becomes correct for
-- free — they already all filter on status, per a repo-wide check.
--
-- Every-minute cadence matches the granularity "Upcoming" already implies
-- (hour-aligned Turf slots) and mirrors this project's existing informal
-- convention for fn_expire_stale_holds (documented as "call periodically via
-- pg_cron if enabled, or lazily from the client poll" — this is that).
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'auto-complete-past-bookings') then
    perform cron.unschedule('auto-complete-past-bookings');
  end if;
end $$;

select cron.schedule(
  'auto-complete-past-bookings',
  '* * * * *',
  $$select public.fn_auto_complete_past_bookings();$$
);
