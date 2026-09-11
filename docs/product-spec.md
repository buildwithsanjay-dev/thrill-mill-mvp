# Thrill Mill Club — Product Spec (Dev Summary)

This is a structured, development-friendly summary of
`assets/Thrill MIll Final MVP Blueprint_v1.pdf` (the authoritative full spec — consult it for exact
wording or edge cases not covered here). This file is a summary, not a replacement.

## 1. Overview & Objective

Sports-club community management + Turf/Pickleball booking app. MVP scope = Turf and
Pickleball booking (two sports, sharing one Team credit pool) + Team-based community
management. Validate whether the club can run Team community/booking digitally, replacing
manual/WhatsApp coordination, while getting membership, credit, booking, and cancellation
logic *correct* — that correctness matters more than feature breadth for this MVP.

**Explicitly outside MVP:** multi-sport management beyond Turf and Pickleball, verified match
results/score-based ranking, tournament management, advanced AI moderation, individual
wallet-to-wallet transfers, individual payment splitting, automatic participant credit collection,
advanced financial settlement, complex enterprise Admin dashboards, advanced reporting,
media-heavy chat, public iOS release (Android-first MVP), in-app payment gateway (Razorpay
explicitly removed from this revision — replaced by Admin-verified external payment).

**Success criteria:** a real user can go end-to-end register→join Team→membership
request→Admin verifies external payment→credits loaded→browse availability→hold
slot→select participants→confirm booking→credits deducted→session completes→final
participants locked→usage attributed→analytics/leaderboards updated. Admin can additionally:
view/create Teams, review+verify membership requests, activate memberships, load credits,
create bookings on behalf of a Team, and manage Turf availability.

## 2. Roles & Permissions

Two-level model:
- **Platform role** (global): `MEMBER` | `ADMIN`.
- **Team role** (per-Team, contextual): `HOST` | `CO-HOST` | `MEMBER`. Every Team has exactly
  one Host, zero-or-one Co-host, one-or-more Members. A user's Team role in Team A has no
  bearing on their role in Team B.

**Member can:** register/login, view own Teams, join/create Teams (where eligible), view Team
info/members/wallet balance/credit activity, view Turf availability, participate in bookings, view
booking/participation history, view own credits-used-through-participation, use Team chat,
receive notifications, view both leaderboards, view personal usage insights.
**Member cannot:** modify Team wallet, add/remove credits, transfer credits, do Admin
operations, verify/approve payments, activate membership, block/unblock Turf.

**Host can (in their own Team only):** manage Team members, assign Co-host, initiate
bookings, select/modify participants (before cutoff), cancel eligible bookings, view wallet
info/activity/usage.

**Co-host can (in their own Team only):** initiate bookings, select/modify participants, cancel
eligible bookings, view wallet info, manage permitted Team activities. Cannot assign Co-host.
Exact Host/Co-host permission delta is intentionally kept small and configurable.

**Admin (global, platform-level) can:** view/search all Teams (incl. by Team ID), view Team
members + Host/Co-host contact info, create Teams on behalf of customers, assign Host/Co-host,
review membership requests, contact Host/Co-host re: payment, verify external payment,
approve membership + load Team wallet credits, view all bookings, create bookings on behalf of
any Team (using the same booking engine as Host/Co-host), block/unblock Turf slots, perform
authorized manual credit adjustments (with reason, audited), view operational analytics/weekly
leaderboards. Host/Co-host phone numbers are Admin-only operational data — never expose to
other Members.

**Permission matrix highlights** (✅/❌/*=conditional — see blueprint §2.11 for full table):
| Capability | Member | Host | Co-host | Admin |
|---|---|---|---|---|
| Create Team | ✅* | — | — | ✅ |
| Manage Team members | ❌ | ✅ | ✅* | ✅ |
| Assign Co-host | ❌ | ✅ | ❌ | ✅ |
| Verify external payment | ❌ | ❌ | ❌ | ✅ |
| Approve membership / load credits | ❌ | ❌ | ❌ | ✅ |
| Initiate Turf booking | ❌* | ✅ | ✅ | ✅ |
| Create booking for another Team | ❌ | ❌ | ❌ | ✅ |
| Block/unblock Turf slot | ❌ | ❌ | ❌ | ✅ |
| Manual credit adjustment | ❌ | ❌ | ❌ | ✅ |
| View own Teams / wallet / bookings | ✅ | ✅ | ✅ | ✅ |

**Role isolation rules:** Admin ≠ Team role (global). Team roles are contextual (not transferred
across Teams). Member data access is Team-specific. UI hiding ≠ security — backend must
independently verify. Financial ops are Admin-controlled only. Sensitive Admin ops are auditable.

## 3. Business Rules (condensed — blueprint §3 has full detail + examples)

1. Teams are the primary community unit; credits belong to the Team, never individual Members.
2. Two Team-creation paths (Member-created, Admin-assisted-on-behalf-of-customer) produce
   identical Team objects with identical subsequent rules — no separate "Admin Team" type.
3. **Membership plans:** both Turf and Pickleball operate 5AM–midnight only; every slot is
   whole-hour aligned (no slot straddles the 5PM band boundary), so pricing is computed
   hour-by-hour.
   - Time-banded rates, shared by both plans, and **identical for both Turf and Pickleball**
     (no sport-specific pricing):
     | Band | Membership rate | Standard rate |
     |---|---|---|
     | 5AM–5PM (day), all days | ₹350/hr | ₹400/hr |
     | 5PM–midnight, weekdays | ₹650/hr | ₹700/hr |
     | 5PM–midnight, weekends | ₹650/hr | ₹800/hr |
     Membership day/night rates do not vary by weekday/weekend; the standard night rate does
     (standard day rate does not).
   - ₹10,000 plan: pay ₹10,000 → **15,000 credits allocated**. **Max 3 discounted playing
     hours per rolling 24-hour window** (by hours, not booking count/day/member count) — the
     discount allowance is consumed in booking order regardless of band **and is shared across
     both sports** (a Pickleball hour and a Turf hour draw from the same rolling-24h allowance
     for a Team); hours beyond it bill at the standard rate for their own band.
   - ₹25,000 plan: pay ₹25,000 → **40,000 credits allocated**. No discount-hour cap — every
     booked hour bills at the membership day/night rate, on either sport.
   - Credits never expire under the current rule. Both plans' credits are spendable on either
     sport interchangeably — one wallet per Team, no separate per-sport pools.
4. **Membership request flow:** Team created → members added → plan selected → confirm →
   request sent to Admin → Admin sees Team/Host/Co-host details + phone numbers → Admin
   contacts Host/Co-host → external payment collected (UPI/QR/bank/cash — club's choice) →
   Admin verifies → approves → credits loaded → Team = ACTIVE. No in-app gateway.
5. **Turf booking:** view availability → select date/slot/duration → price calculated
   server-side → check wallet → select participants → **1-minute server-controlled hold** →
   confirm → credits deducted atomically → booking recorded. Admin-assisted booking uses the
   identical engine/pricing/wallet logic, just entered via Team ID lookup.
6. **Participant/usage attribution:** booking's actual credits ÷ final participant count = per-member
   usage insight (analytics only — no credit transfer, no per-member wallet).
7. **Cancellation:** ≥24h before session → full refund + restore any consumed discounted-hour
   allowance; <24h → no refund. Eligibility decided by **server time**, never device clock.
8. **Leaderboards (weekly, Mon 00:00–Sun 23:59, business timezone):** Team ranked by count of
   completed Turf bookings; Member ranked by credits-used-through-completed-participation.
   Only completed/historical records count — no self-entered scores.
9. **Data integrity invariants (must always hold):** Team credits never negative; one slot never
   has two confirmed bookings; only one active membership grants normal access; one verified
   payment allocates credits exactly once; every credit change has a ledger entry; only eligible
   Team members can be participants; refunds only per 24h policy; usage = actual credits ÷
   final participants.
10. **Business rule priority when rules conflict:** financial/credit correctness > booking
    integrity > authorization/security > membership rules > participant integrity > usage
    attribution > notifications > analytics/leaderboards > UI convenience. Never sacrifice the
    former for the latter.

## 4. Core Workflows (condensed — 30 workflows in blueprint §4)

| # | Workflow | Key transition |
|---|---|---|
| 1 | Overall MVP flow | login → team → membership → wallet → booking → completion → analytics |
| 2 | User authentication | Supabase Auth → load profile/platform role/Team memberships → resolve roles |
| 3 | Member creates Team | Team created → `PAYMENT_PENDING` (membership + Team creation are separate ops) |
| 4 | Admin creates Team on behalf of customer | same result as (3), no special Team type |
| 5 | Add/join Team members | invite → accept (`ACTIVE`) or reject (`REJECTED`) |
| 6 | Admin membership request review | sees Team/Host/Co-host/phone/plan → contact → verify → approve |
| 7 | External membership payment & activation | payment recorded → Admin verifies → membership `ACTIVE` → wallet credited → ledger + audit |
| 8 | Team wallet | credits available → reserved → consumed; refund path restores available |
| 9 | View Turf availability | checks confirmed bookings + active holds + Admin blocks |
| 10 | Calculate booking price | active plan + rolling-24h usage → membership/standard hour split → final price |
| 11 | Member/Host booking | select Team/Turf/date/duration → price → participants → credit check → attempt |
| 12 | Admin-assisted booking | Team ID lookup → same engine as (11) |
| 13 | One-minute slot hold | `AVAILABLE→HELD→CONFIRMED` or `HELD→EXPIRED→AVAILABLE` (server timer) |
| 14 | Participant selection | select from Team roster → booking-scoped list (not Team roster mutation) |
| 15 | Confirm booking | validate hold+availability+credits+auth+price+participants → atomic debit+ledger+confirm |
| 16 | Booking notification | fan-out to participants/Host/Co-host/Admin |
| 17 | Modify participants | editable pre-session; locked at session start |
| 18 | Session completion | `COMPLETED` → usage attribution → analytics → leaderboard update |
| 19 | Member usage attribution | actual credits ÷ final participants (analytics only) |
| 20 | Mixed-rate booking usage | total actual credits used (not split by rate) ÷ participants |
| 21 | Cancellation | ≥24h: refund+restore; <24h: no refund (server time) |
| 22 | ₹10,000 discounted-hour restoration | eligible cancellation restores consumed discount allowance |
| 23 | Admin Turf slot blocking | `AVAILABLE→BLOCKED` with reason; blocks new bookings |
| 24 | Club-initiated booking cancellation | Admin block affecting existing booking → cancel/reschedule per policy |
| 25 | Admin manual credit adjustment | amount+reason+admin+timestamp → ledger + audit, never direct balance overwrite |
| 26 | Weekly Team leaderboard | count of completed bookings, Mon–Sun |
| 27 | Weekly Member leaderboard | credits used through completed participation, Mon–Sun |
| 28 | Admin membership payment delay | stays `PAYMENT_PENDING` until Admin verifies — no auto-activation |
| 29 | Admin membership approval success | contact → payment → confirm → activate → credit → ledger → audit |
| 30 | Failed/interrupted booking | client re-queries current state on reconnect, never blindly re-creates |
| — | Repeat booking | preload prior booking's Team/participants/duration but **recalculate** price/availability fresh |

## 5. State Machines (summary — full detail in blueprint §5)

| Entity | States | Terminal |
|---|---|---|
| Team | `CREATED → ACTIVE → INACTIVE → ARCHIVED` | ARCHIVED |
| Team membership (user↔Team) | `INVITED → PENDING → ACTIVE → REMOVED` / `REJECTED` / `LEFT` | REMOVED, REJECTED, LEFT |
| Membership request/activation | `PLAN_SELECTED → REQUEST_SUBMITTED → PAYMENT_PENDING → ADMIN_REVIEW → PAYMENT_VERIFIED → ACTIVE` (or back to PAYMENT_PENDING on rejection) | ACTIVE |
| Payment verification | `PAYMENT_EXPECTED → PAYMENT_PENDING → ADMIN_VERIFICATION → VERIFIED` / `NOT_VERIFIED` | VERIFIED |
| Team wallet credit | `AVAILABLE → RESERVED → CONSUMED`; refund path `CONSUMED → REFUNDED → AVAILABLE` | — (ongoing) |
| Turf slot | `AVAILABLE → HELD → CONFIRMED`; `HELD → EXPIRED → AVAILABLE`; `AVAILABLE ↔ BLOCKED` (Admin) | CONFIRMED |
| Slot hold | `ACTIVE → CONVERTED` / `EXPIRED` / `RELEASED` (server-timestamped, 1 min) | CONVERTED, EXPIRED, RELEASED |
| Booking | `HOLDING → CONFIRMED → IN_PROGRESS → COMPLETED`; can go to `CANCELLED`/`EXPIRED`/`FAILED` | COMPLETED, CANCELLED, FAILED, EXPIRED |
| Booking participant | `SELECTED → LOCKED (session start) → COMPLETED → USAGE_ATTRIBUTION`; editable only pre-lock | COMPLETED |
| Session | `SCHEDULED → IN_PROGRESS → COMPLETED` | COMPLETED |
| Cancellation/refund | eligible (≥24h): full refund + discount restore; late (<24h): no refund | — |
| Admin Turf block | `AVAILABLE ↔ BLOCKED`; affects existing bookings via configured policy | — |
| Admin credit adjustment | `REQUEST → AUTH_CHECK → REASON_REQUIRED → VALIDATE → POST → LEDGER → AUDIT` | POSTED |

**Invalid transitions the backend must reject:** COMPLETED→CONFIRMED, EXPIRED
HOLD→CONFIRMED, CANCELLED→CONFIRMED, insufficient-credits→successful-debit,
unverified-payment→credit-allocation, blocked-slot→new-confirmed-booking,
non-admin→admin-operation.

**Highest engineering priority chain (per blueprint §5.22):** Membership Payment Verification →
Team Wallet/Credit → Turf Slot → Booking → ₹10,000 rolling-24h pricing → Cancellation/Refund
→ Participant Finalization → Usage Attribution.
