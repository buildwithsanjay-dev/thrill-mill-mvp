# Pricing rework + Pickleball + shared credits — design

Status: approved by user (in-chat), 2026-09-10. Sub-project 1 of 3 (see also:
credit-usage visibility, moderated team chat — separate specs/cycles).

## Why

The client wants a second sport (Pickleball, 4 courts) added alongside the
existing football Turf, under a revised pricing model, with both sports
drawing from the same Team wallet/credit pool. This changes rates that
CLAUDE.md currently marks as locked, per explicit user approval in this
session.

## New pricing (replaces the current day/night membership/standard bands)

| Band | Member rate | Non-member rate |
|---|---|---|
| 5AM–5PM (day), all days | ₹350/hr | ₹400/hr |
| 5PM–midnight, weekdays | ₹650/hr | ₹700/hr |
| 5PM–midnight, weekends | ₹650/hr | ₹800/hr |

- Member day/night rates do **not** vary by weekday/weekend.
- Non-member night rate **does** vary by weekday/weekend; non-member day rate
  does not.
- These rates are identical for both Turf and Pickleball — no sport-specific
  pricing.
- The ₹10,000 plan's existing 3-discounted-hour/rolling-24h cap is
  **unchanged** — still governs how many hours in a booking get the member
  rate before falling through to the non-member rate. The ₹25,000 plan
  remains uncapped. (Confirmed explicitly with user — not being removed
  despite the user's initial numbers omitting it.)
- Credits allocated on activation (15,000 / 40,000) are unchanged.
- Both plans' credits are spendable on either sport interchangeably — one
  wallet per Team, no separate pools.

## Data model changes

### `turf_resources`
- Add `sport` — new enum type `sport_type` (`TURF`, `PICKLEBALL`), not null.
- Backfill the existing "Thrill Mill Turf" row to `sport = 'TURF'`.
- Seed 4 new rows: "Pickleball Court 1".."Court 4", `sport = 'PICKLEBALL'`,
  following the exact seeding pattern already used for the Turf row
  (`supabase/migrations/20260905044245_join_flow_and_lookups.sql`, seed +
  60-day hourly 5AM–midnight slot generation per resource, `on conflict do
  nothing`).

### `membership_plans`
- Update existing rate columns to the new values:
  `membership_day_rate_per_hour = 350`, `membership_night_rate_per_hour =
  650`, `standard_day_rate_per_hour = 400`.
- Add new column `standard_night_weekend_rate_per_hour integer not null`
  (value `800`); repurpose existing `standard_night_rate_per_hour` as the
  **weekday** night standard rate (value `700`) — rename via
  `alter table ... rename column standard_night_rate_per_hour to
  standard_night_weekday_rate_per_hour` for clarity, update all call sites.
- `discounted_hours_cap_per_24h` unchanged (3 for `PLAN_10K`, null for
  `PLAN_25K`).

### `bookings`
- No new columns. Existing snapshot columns
  (`standard_night_rate_applied` etc.) already store the *resolved* rate for
  that booking's actual date — the RPC just needs to pick weekday vs weekend
  when populating `standard_night_rate_applied`, same column as today.

## `fn_confirm_booking` changes

- Resolve day-of-week from `v_slot.slot_date` (`extract(isodow from
  v_slot.slot_date)` — 6/7 = Sat/Sun) once, before the hour-by-hour loop.
- In the hour-by-hour loop's "standard, night" branch, select
  `v_plan.standard_night_weekday_rate_per_hour` or
  `v_plan.standard_night_weekend_rate_per_hour` based on that day-of-week
  flag, instead of the single `standard_night_rate_per_hour` used today.
- Everything else (cap resolution, day/night band boundary at 5PM, wallet
  debit, ledger entry, booking insert) is structurally unchanged — only the
  standard-night rate lookup gains the weekday/weekend branch.
- `v_slot.turf_id` (hence `sport`) already flows into the booking insert
  unchanged — sport doesn't affect price, only which resource/slot pool was
  booked.

## Client changes

### `getDefaultTurf()` → sport-aware resource listing
Replace the single-row "grab whichever turf exists" query
(`mobile/src/features/booking/api.ts`) with a `getTurfResources(sport?)`
that lists active resources filtered by sport. `TurfResource` type
(`mobile/src/types/db.ts`) gains a `sport: 'TURF' | 'PICKLEBALL'` field.

### Booking flow
New **Select Sport** step (Turf vs Pickleball) before the existing
turf/court picker:
- Turf: only one resource exists, so this step still shows a single card
  and lets the user continue straight through (keeps today's flow feeling
  unchanged for Turf).
- Pickleball: shows Court 1–4 as separate selectable resources, each
  leading into the existing (already generic, per-`turf_id`) slot-grid
  screen unchanged.

### Membership plan display
Update every screen showing plan rates (membership plan selection, plan
details, any admin-side plan display) to the new numbers, and add a note
that credits are shared across Turf and Pickleball.

## Testing

Per CLAUDE.md's Testing Requirements (financial/booking-critical path):
- A booking that spans the 5PM boundary on a weekday vs a weekend produces
  different `total_credits` (weekday standard-night hours cheaper than
  weekend).
- A ₹10,000-plan Team's cap-exceeding booking still falls through to
  standard rate correctly, now correctly weekday/weekend-branched for any
  night hours beyond the cap.
- A ₹25,000-plan Team booking Pickleball is priced identically (per-hour)
  to the same hours booked on Turf.
- Cross-sport wallet debit: booking Pickleball debits the same
  `team_wallets` row a Turf booking would.

## Out of scope for this sub-project

Credit-usage-by-member visibility (separate spec) and moderated team chat
(separate spec) — tracked as sub-projects 2 and 3 of the same feature
request, not part of this change.
