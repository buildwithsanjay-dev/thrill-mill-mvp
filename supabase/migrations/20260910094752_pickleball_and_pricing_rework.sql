-- Pickleball as a second sport + revised member/non-member pricing model,
-- per docs/superpowers/specs/2026-09-10-pricing-pickleball-shared-credits-design.md.
-- Credits remain shared across both sports (one team_wallets row per Team,
-- unchanged) — this migration only adds a sport dimension to resources and
-- reworks the rate columns; no wallet/credits schema change is needed.

-- 1. Sport dimension on turf_resources ---------------------------------
create type public.sport_type as enum ('TURF', 'PICKLEBALL');

alter table public.turf_resources
  add column sport public.sport_type not null default 'TURF';

alter table public.turf_resources
  alter column sport drop default;

-- 2. membership_plans: new rate values + weekday/weekend split ---------
alter table public.membership_plans
  rename column standard_night_rate_per_hour to standard_night_weekday_rate_per_hour;

alter table public.membership_plans
  add column standard_night_weekend_rate_per_hour integer;

update public.membership_plans set
  membership_day_rate_per_hour = 350,
  membership_night_rate_per_hour = 650,
  standard_day_rate_per_hour = 400,
  standard_night_weekday_rate_per_hour = 700,
  standard_night_weekend_rate_per_hour = 800;

alter table public.membership_plans
  alter column standard_night_weekend_rate_per_hour set not null,
  add constraint chk_membership_plans_weekend_rate_positive
    check (standard_night_weekend_rate_per_hour > 0);

-- 3. Seed 4 Pickleball courts + 60 days of hourly slots -----------------
-- Same pattern as the existing Turf seed in
-- supabase/migrations/20260905044245_join_flow_and_lookups.sql.
do $$
declare
  v_court_name text;
  v_court_id uuid;
  v_day date;
  v_hour int;
begin
  for v_court_name in
    select unnest(array[
      'Pickleball Court 1', 'Pickleball Court 2',
      'Pickleball Court 3', 'Pickleball Court 4'
    ])
  loop
    select id into v_court_id from public.turf_resources where name = v_court_name;
    if v_court_id is null then
      insert into public.turf_resources (name, description, sport)
      values (v_court_name, 'Thrill Mill Arena — outdoor pickleball court', 'PICKLEBALL')
      returning id into v_court_id;
    end if;

    for v_day in
      select generate_series(current_date, current_date + interval '59 days', interval '1 day')::date
    loop
      for v_hour in 5..23 loop
        insert into public.turf_slots (turf_id, slot_date, start_time, end_time, status)
        values (v_court_id, v_day, make_time(v_hour, 0, 0), make_time(v_hour + 1, 0, 0), 'AVAILABLE')
        on conflict (turf_id, slot_date, start_time) do nothing;
      end loop;
    end loop;
  end loop;
end $$;

-- 4. Backfill the existing Turf row's sport (belt-and-suspenders — the
--    column default already set this, but be explicit for anyone reading
--    the migration in isolation).
update public.turf_resources set sport = 'TURF' where name = 'Thrill Mill Turf';
