-- Items 4 & 5 (one bug) from the project owner's 2026-09-13 EAS preview
-- bug report: a slot's 1-minute hold was only ever released back to
-- AVAILABLE lazily — fn_expire_stale_holds() existed (see
-- 20260904160200_rpc_functions.sql) but nothing actually called it. The
-- only self-heal was inside fn_create_slot_hold(), which only clears a
-- stale hold on the EXACT slot someone next tries to hold — so a slot
-- whose hold expired stayed shown as HELD (greyed out, unbookable by
-- anyone, including the team that originally held it) until some other
-- team happened to click that exact same slot again.
--
-- Fixed the same way this project already fixed the equivalent lazy-cleanup
-- problem for past bookings (see 20260908000000_schedule_auto_complete_
-- past_bookings.sql): schedule the existing, already-correct
-- fn_expire_stale_holds() via pg_cron so it runs unattended for every slot,
-- not just the one someone happens to interact with next.
--
-- 20-second cadence (not the 1-minute cadence used for bookings) because
-- the hold TTL itself is only 1 minute — a 1-minute cleanup cadence could
-- leave a slot visibly stuck HELD for up to another full minute after its
-- hold expired, which is the exact "must be IMMEDIATELY available, not
-- greyed out" complaint. This lines up with the client's own 15s
-- refetchInterval on the slot grid (useTurfSlots, mobile/src/features/
-- booking/useBooking.ts) so a freed slot reliably shows as available
-- within roughly one client poll cycle, for every viewer.
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'expire-stale-slot-holds') then
    perform cron.unschedule('expire-stale-slot-holds');
  end if;
end $$;

select cron.schedule(
  'expire-stale-slot-holds',
  '20 seconds',
  $$select public.fn_expire_stale_holds();$$
);
