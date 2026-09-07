# Thrill Mill Club — MVP Architecture

Proposed technical architecture for a production-capable MVP, optimized for fast iteration while
protecting the highest-risk chain: **wallet → booking → cancellation → usage attribution**. Not
over-engineered — one app, one database, server-authoritative business logic. Full rationale and
every business rule behind these decisions: `docs/product-spec.md` and the source blueprint.

## 1. Stack

```
React Native (Expo)  — Android-first client
        │  HTTPS / Supabase client SDK, authenticated session
        ▼
Supabase
  ├─ Auth              — session issuance, identity source of truth
  ├─ PostgreSQL         — single source of truth for all business data
  ├─ Row Level Security — table/row-level access boundary
  ├─ Postgres functions/RPC — atomic multi-step transactions (booking confirm,
  │                           cancel+refund, membership activate+credit)
  └─ Realtime           — chat delivery, live booking/wallet updates
```

One database, one source of truth. No parallel/duplicate stores for credits, bookings, or
membership state (e.g. never keep a cached balance in three tables that can drift).

## 2. Major Components

- **Auth & role resolution** — Supabase Auth session → `profiles` (platform role) → active
  `team_members` rows (per-Team role). Every request's effective permissions are derived fresh
  from this chain, never trusted from the client.
- **Team management** — Team CRUD, member invite/accept/reject, Host/Co-host assignment.
  Member-created and Admin-created Teams are the same object type with identical rules.
- **Membership + payment verification** — plan selection, request submission, Admin review UI
  (Team/Host/Co-host + phone, plan), external payment recording, Admin verification action.
  Admin verification is the *only* trigger for membership activation + credit allocation.
- **Wallet + ledger** — `team_wallets` (current balance) + `wallet_ledger` (append-only history).
  All balance changes go through RPC functions that write both in one transaction.
- **Turf availability + hold + booking engine** — slot inventory, 1-minute server-timestamped
  holds, price calculation (membership rate vs standard rate vs rolling-24h discount allowance),
  atomic booking confirmation (validate → deduct → ledger → confirm, all-or-nothing).
- **Participant + usage attribution** — per-booking participant list (distinct from Team roster),
  lock at session start, post-completion usage-insight calculation (credits ÷ participants).
- **Chat** — one room per Team, membership-gated access, light moderation.
- **Notifications** — event-driven records (`notifications` table) + push delivery; push payload
  stays generic, detail lives behind auth in-app.
- **Admin console (same app, role-gated)** — Team/membership/booking oversight, Turf
  blocking, manual credit adjustment (reason required, audited), operational analytics.
- **Leaderboards** — weekly derived aggregates (`leaderboard_weekly`) computed from completed
  bookings/participation only; never from client-submitted or unconfirmed data.

## 3. Worked Example: Booking Confirmation (highest-risk operation)

```
Client                          Backend (RPC, one transaction)              Database
──────                          ───────────────────────────────             ────────
"Confirm booking,
 hold_id=X"          ────────▶  1. Load hold; check NOW < expires_at
                                 2. Re-check slot not confirmed/blocked
                                 3. Re-check Team membership active
                                 4. Recalculate price server-side
                                    (plan + rolling-24h usage, ignore
                                    any client-sent price)
                                 5. Check team_wallets.available_credits
                                    >= price
                                 6. If all pass, atomically:
                                       - deduct wallet
                                       - insert wallet_ledger row
                                       - insert/confirm booking row
                                       - insert booking_participants
                                       - mark slot CONFIRMED
                                    else: return structured error,
                                    no partial writes
◀───────────────────────────── 7. Return BOOKING_CONFIRMED or e.g.
                                    INSUFFICIENT_CREDITS / HOLD_EXPIRED
Display result
```

This same shape (validate → recompute → atomic multi-write → structured result) applies to
cancel+refund and membership-activate+credit-allocate.

## 4. Database Schema Summary

Full column-level detail: blueprint §6. Table purposes:

| Table | Purpose |
|---|---|
| `profiles` | User profile + platform role (`MEMBER`/`ADMIN`) |
| `teams` | A Team (community/booking unit) |
| `team_members` | User↔Team relationship + Team role (`HOST`/`CO_HOST`/`MEMBER`) + status |
| `membership_plans` | Configurable ₹10,000 / ₹25,000 plan definitions |
| `team_memberships` | A Team's active/pending plan assignment |
| `team_wallets` | Current Team credit balance (available/reserved) |
| `wallet_ledger` | Append-only history of every credit change |
| `payments` | External payment record + Admin verification state |
| `turf_resources` / `turf_slots` | Turf inventory + bookable time slots |
| `slot_holds` | Server-timestamped 1-minute holds |
| `bookings` | Booking lifecycle + pricing snapshot (rates/hours/total applied at booking time) |
| `booking_participants` | Per-booking participant list (not the Team roster) |
| `member_usage_attribution` | Post-completion usage insight per member (analytics only) |
| `chat_rooms` / `chat_messages` | Per-Team chat |
| `notifications` | In-app notification records |
| `admin_audit_logs` | Every sensitive Admin action (who/what/reason/before/after) |
| `leaderboard_weekly` | Derived weekly Team/Member rankings |

Conventions: snake_case; `booking_participants` kept separate from `team_members`; financial/
audit tables use soft states (`CANCELLED`/`REMOVED`/`ARCHIVED`) — never hard-deleted or
silently rewritten; every booking stores its own pricing snapshot so history stays explainable even
if plan pricing changes later.

## 5. Transaction / Atomicity Strategy

Any operation touching money, inventory, or historical state must be a single atomic unit —
implemented as a Postgres function/RPC callable via Supabase, not a sequence of separate
client-issued writes. Minimum atomic operations:

- **Booking confirmation** — hold validate → price recompute → wallet debit → ledger insert →
  booking confirm → slot confirm.
- **Cancellation** — eligibility check (server time) → booking cancel → wallet refund → ledger
  insert → discounted-hour allowance restore (₹10,000 plan only).
- **Membership activation** — payment verify → membership active → wallet credit → ledger
  insert → audit log insert. Idempotent on `membership_id` so a repeated verification can't
  double-allocate credits.
- **Admin manual credit adjustment** — validate reason/amount → wallet update → ledger insert
  → audit log insert. Never a direct balance overwrite.

## 6. Client / Server Responsibility

| Concern | Client | Backend |
|---|---|---|
| UI, forms, navigation, countdown display | ✅ owns | — |
| Price preview | ✅ estimate for UX | ✅ final, authoritative |
| Slot availability display | ✅ shows | ✅ decides at operation time |
| 1-minute hold | visual countdown only | creates hold, owns `expires_at`, decides validity |
| Booking confirm / cancel / add-participant | sends request | validates + executes + commits |
| Wallet balance mutation | never | always (RPC only) |
| Membership activation / credit allocation | never | always, Admin-triggered, idempotent |
| Usage attribution / leaderboard calc | displays result | computes from completed records |
| Admin-only ops (Turf block, credit adjust, role change) | sends request (Admin UI) | independently re-checks `platform_role = ADMIN` server-side |

Full decision matrix: blueprint §8.22. The rule that must never be violated: **the client can ask,
the backend decides.**

## 7. Security Architecture

Layered: **Authenticate** (Supabase Auth session) → **Authorize** (platform role + Team
role/membership, RLS + server-side checks) → **Validate** (business rules — availability, credits,
timing) → **Execute** (atomic transaction) → **Record** (ledger/audit where required).

- RLS policies mirror the permission matrix in `docs/product-spec.md` §2 — every table's
  read/write access is scoped by authenticated identity + Team membership + role.
  Cross-Team access must fail even if a client sends a foreign `team_id`.
- Pricing, availability, hold-validity, cancellation-eligibility, and wallet balance are always
  server-recomputed — client-submitted values for these are never trusted.
  Idempotency required for payment verification/credit allocation and booking confirmation so
  retries can't duplicate financial effects.
- Every sensitive Admin action (membership approval, credit load/adjustment, role change,
  booking override, Turf block/unblock, refund override) produces an `admin_audit_logs` row.
- Secrets (Supabase service-role key, any server-side credentials) live only in server-side
  environment config — never in the Expo client bundle or repo.

Full checklist for pre-release validation: see the `release-security-checklist` skill and blueprint
§9.30.

## 8. Intentionally Deferred (not this MVP)

- **Payment gateway** (Razorpay etc.) — replaced by external collection + Admin verification;
  revisit only if the club's operational model changes.
- **iOS public release** — Android-first for MVP; app is built with Expo so iOS is not
  architecturally blocked, just not released.
- **Pickleball / multi-sport, verified match results, tournaments** — Team/Turf model doesn't
  yet generalize to multiple sport types or scored competition; would need schema changes.
- **Individual wallets / member-to-member transfers / payment splitting** — conflicts with the
  Team-owns-credits model; would be a significant business-rule change, not just a feature add.
- **Advanced AI moderation, media-heavy chat, complex Admin dashboards/reporting** — basic
  versions are enough for MVP validation; revisit based on real usage.
