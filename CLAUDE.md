# Thrill Mill Club — MVP

## Product Context

Thrill Mill Club is a sports-club community management and Turf booking app. The MVP covers
Turf operations and Team-based community management only (no Pickleball, no multi-sport, no
verified match results/tournaments). It must be a **functional, production-oriented app**, not a
prototype — financial, booking, and authorization correctness take priority over feature breadth.

Full detail: the product spec PDF is at `assets/Thrill MIll Final MVP Blueprint_v1.pdf` (source of
truth for anything not covered here or in `docs/`) and the condensed dev-facing summary is at
`docs/product-spec.md`. Architecture detail is in `docs/architecture.md`.

**Core principle:** the Team is the financial unit; the individual member is the participation and
analytics unit. Credits belong to Teams, never to individual members.

## User Roles

Two-level role model — do not conflate these:

- **Platform role** (global, on the user): `MEMBER` | `ADMIN`. Admin is a platform operator role,
  not a Team role, and is not automatically granted by any Team membership.
- **Team role** (per-Team, contextual): `HOST` | `CO-HOST` | `MEMBER`. A user can be Host in one
  Team and a plain Member in another — Team roles never carry across Teams.

Admin uses the same mobile app as everyone else; extra capabilities are exposed via
authorization, not a separate app.

## Core User Flow

```
Register/Login → Create/Join Team → Add Members → Select Membership Plan
→ Confirm Membership Request → Admin Review → Admin Contacts Host/Co-host
→ Payment Collected & Verified Externally → Membership Approved
→ Credits Loaded to Team Wallet → Turf Availability → 1-Minute Hold
→ Select Participants → Booking Confirmed (credits deducted atomically)
→ Session Completes → Final Participants Locked → Usage Attribution
→ Team/Member Analytics → Weekly Leaderboards
```

Admin can also create Teams and bookings on behalf of customers, using the exact same
underlying engine/rules as a Host/Co-host would.

## Business Rules (non-negotiable — see `docs/product-spec.md` §3 for full list)

- **No in-app payment gateway.** Membership payment is collected externally (UPI/QR/bank/
  cash) and verified by an Admin. Razorpay/any gateway is explicitly out of scope.
- **Two membership plans**, prices, credits, and discount rule are fixed unless the user
  explicitly changes them:
  - ₹10,000 plan → **15,000 credits allocated on activation** (not equal to amount paid).
    Capped at **3 discounted playing hours per rolling 24-hour window** (hours, not
    bookings/day/members) — the 4th+ hour in that window falls to the standard rate.
  - ₹25,000 plan → **40,000 credits allocated on activation**. No discount-hour cap — every
    booked hour is charged at the membership rate.
  - **Both plans share the same time-banded rates** (Turf operates 5AM–midnight only; every
    slot is whole-hour aligned so no slot straddles a band boundary):
    | Band | Membership rate | Standard rate |
    |---|---|---|
    | 5AM–5PM (day) | ₹450/hr | ₹500/hr |
    | 5PM–midnight (night) | ₹800/hr | ₹1,000/hr |
  - A booking spanning both bands is priced hour-by-hour; the rolling-24h discount allowance
    is consumed in booking order regardless of band, then remaining hours bill at the
    standard rate for their own band.
- **Credits do not expire** under the current rule — never implement auto-expiry.
- **Cancellation:** ≥24 hours before session → full refund + restore discounted-hour usage; <24
  hours → no refund. Eligibility is decided by **server time**, never device time.
- **Every credit balance change must produce a `wallet_ledger` entry.** No silent wallet writes.
- **Every sensitive Admin action must produce an `admin_audit_logs` entry** (membership
  approval, credit load/adjustment, role change, booking override, Turf block, refund override).
- **One verified payment → exactly one credit allocation.** Duplicate activation must not
  double-allocate credits (idempotency required).
- **Usage attribution is analytics, not a transfer:** completed booking credits ÷ final participant
  count = per-member usage insight. The Team wallet is not split or debited per member.
- Historical financial/booking/audit records are never silently overwritten — use soft states
  (`CANCELLED`, `REMOVED`, `ARCHIVED`) and correction events, not deletion or in-place edits.

## Technology Stack

- **Client:** React Native + Expo, Android-first (no public iOS release in MVP).
- **Backend/DB:** Supabase — PostgreSQL, Supabase Auth, Row Level Security, Realtime,
  server-side functions/RPC for atomic multi-step operations.
- One database, one source of truth — do not introduce parallel/duplicate stores for
  credits, bookings, or membership state.

## Architecture (see `docs/architecture.md` for detail)

> The mobile app requests and displays. The backend validates, decides, and commits. The
> database records the final truth.

The client may compute **previews** (estimated price, countdown timers) for UX, but the
backend is always authoritative for: final price, slot availability, hold validity, wallet balance,
booking confirmation, refund eligibility, usage attribution, and leaderboard scores. Multi-step
financial/booking operations (booking confirm, cancel+refund, membership activate) must be
atomic — implement as Postgres transactions/RPC, not sequential client-side writes.

## Project Structure

Scaffolded as of 2026-09-04:

```
thrill-mill-mvp/
├── mobile/                  # Expo React Native app (Android-first, iOS-scalable)
│   ├── app/                 # Expo Router — file-based routes/screens
│   ├── src/
│   │   ├── components/      # Shared, presentational UI components
│   │   ├── features/        # Feature-sliced modules: booking/, team/, membership/, wallet/, admin/
│   │   ├── lib/              # supabase.ts (client init), queryClient.ts (TanStack Query)
│   │   ├── stores/           # Zustand — client-only UI state, never permission/financial state
│   │   ├── hooks/
│   │   ├── types/            # Shared TS types mirroring the DB schema
│   │   └── constants/
│   ├── assets/               # Expo icons/splash/fonts (distinct from repo-root assets/)
│   ├── app.json               # Expo config (expo-router, expo-status-bar, expo-splash-screen plugins)
│   ├── .env.example            # committed — documents required EXPO_PUBLIC_* vars
│   ├── .env                    # gitignored — real Supabase URL/anon key, filled in locally
│   └── package.json
├── supabase/                 # Backend: source of truth for DB schema
│   ├── migrations/            # SQL migrations (schema, RLS policies, RPC functions) — supabase CLI
│   ├── functions/             # Edge Functions (if/when needed)
│   └── config.toml
├── assets/                   # unchanged — source blueprint PDF
├── docs/                      # unchanged — architecture.md, product-spec.md
└── CLAUDE.md
```

Full DB schema (the 18 tables listed under Database Conventions below) is intentionally not yet
implemented — `supabase/migrations/` currently holds only a placeholder migration proving the
`supabase db push` pipeline works. Schema + RLS + RPCs are a dedicated next step, not bundled
into initial scaffolding.

## Coding Conventions

- **Language:** TypeScript everywhere in `mobile/` — no plain `.js`/`.jsx`, this is a financial app.
- **Navigation:** Expo Router (file-based, under `mobile/app/`). Route files stay thin — they wire
  up a screen from `src/features/*`, they don't hold business logic themselves.
- **Server state** (bookings, wallet balances, teams, membership status, anything from Supabase):
  TanStack Query. Screens must always tolerate the backend disagreeing with cached data (e.g.
  `INSUFFICIENT_CREDITS` on confirm even though a cached balance looked sufficient) — cached
  data is a UI-responsiveness layer only, never a source of truth for money/availability.
- **Client-only UI state** (active Team selection, expanded/collapsed UI, draft form state):
  Zustand, under `src/stores/`. Never store permission/role/financial state here — that's always
  re-derived server-side per the Authentication/Authorization rules above.
- **Path alias:** `@/*` maps to `mobile/src/*` (see `mobile/tsconfig.json`).
- **Feature-sliced structure:** business logic lives under `src/features/<domain>/` (e.g.
  `features/booking/`, `features/wallet/`), not scattered across route files.
- Never hardcode Android-only assumptions in business logic (`Platform.OS` checks are for
  genuine UI/platform quirks only) — keeps the app honestly scalable to iOS later, per the
  Technology Stack section above.

## UI/UX Conventions

Not yet established. Follow the workflows and screen-level state transitions in
`docs/product-spec.md` §4–§5 when screens are built; document concrete conventions here once
decided.

## API Conventions

- Return **structured business-outcome codes**, never raw DB/server errors, e.g.
  `INSUFFICIENT_CREDITS`, `SLOT_UNAVAILABLE`, `HOLD_EXPIRED`, `MEMBERSHIP_INACTIVE`,
  `CANCELLATION_NOT_ALLOWED`, `PAYMENT_PENDING`, `UNAUTHORIZED`, `FORBIDDEN`.
- Never trust client-supplied `user_id`, role, price, or availability — derive identity from the
  authenticated session and recompute everything server-side.

## Database Conventions

- snake_case table names; core tables per `docs/architecture.md` (`profiles`, `teams`,
  `team_members`, `membership_plans`, `team_memberships`, `team_wallets`, `wallet_ledger`,
  `payments`, `turf_resources`, `turf_slots`, `slot_holds`, `bookings`, `booking_participants`,
  `member_usage_attribution`, `chat_rooms`, `chat_messages`, `notifications`,
  `admin_audit_logs`, `leaderboard_weekly`).
- `booking_participants` is separate from `team_members` — a booking's participant list is
  per-booking data, never a mutation of Team membership.
- Financial/audit tables (`wallet_ledger`, `payments`, `admin_audit_logs`, completed bookings)
  are append-only in practice — soft-delete/soft-state, never hard-delete or silently edit.
- Every booking stores its own pricing snapshot (`membership_rate_applied`,
  `standard_rate_applied`, `discounted_hours_used`, `standard_hours_used`, `total_credits`) so
  historical cost is explainable even if plan pricing later changes.

## Authentication / Authorization Rules

- Auth via Supabase Auth; permission resolution always follows: authenticated user → platform
  role → Team membership → Team role → permission check → allowed operation.
- **Hiding a UI element is not security.** Every sensitive operation must be independently
  authorized server-side/via RLS, regardless of what the client shows.
- Team data isolation is mandatory: a user must never read/write another Team's data by
  changing a `team_id` in a request — enforce via RLS + server-side checks, not client trust.
- Admin authority is global/platform-level and must be checked independently of any Team role.

## Integration Rules

- No payment gateway integration in the MVP. Payment = external collection + Admin-recorded
  verification only. Do not add Razorpay or similar without explicit user approval.
- Push notifications should avoid putting financial/private detail in the notification body itself.
- **Push provider decision:** Expo Push Service (not direct Firebase Admin SDK integration).
  Client registers an Expo push token (via `expo-notifications`) and stores it on the user's
  `profiles` row; the backend sends to Expo's push endpoint, which relays to FCM (Android) /
  APNs (iOS later). This means no `FCM_SERVER_KEY`/Firebase Admin credential is needed
  server-side — only `mobile/google-services.json` (gitignored, supplied locally by each
  developer from the Firebase project) is needed client-side for Android push registration to
  work at all.

## Testing Requirements

- Financial and booking-critical paths (booking confirm, cancel+refund, membership
  activate+credit-allocate, admin credit adjustment) must have tests proving atomicity, no
  double-booking, no duplicate credit allocation, and correct ledger/audit record creation.
- Role/permission boundaries (Member vs Host vs Co-host vs Admin, cross-Team isolation) must
  be tested, not just assumed from UI behavior.

## Validation Commands

Run from `mobile/`:

- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — `expo lint`
- `npx expo-doctor` — validates Expo project config/dependency health
- `npm start` — Expo dev server (then `a` for Android)

Run from repo root:

- `npx supabase db push` — applies `supabase/migrations/*.sql` to the linked Supabase project
- `npx supabase migration new <name>` — creates a new timestamped migration file

Test tooling (Jest for the client, pgTAP or equivalent for DB/RPC logic) is not yet set up — to be
added alongside the first real feature implementation, per the Testing Requirements above.

## Security Requirements

See `docs/architecture.md` and blueprint §9 for full detail. Minimum invariants that must always
hold: Team credits never go negative; one Turf slot never has two confirmed bookings; one
verified payment never allocates credits twice; every credit change has a ledger entry; only
eligible Team members can be booking participants; refunds only within the 24-hour policy;
client can never set final price, availability, or hold validity; secrets never ship in the client
bundle.

## Things That Must Not Be Changed Without Explicit Approval

- The two membership plans' pricing, credits allocated, day/night rate bands, and the
  ₹10,000 plan's 3-hour/rolling-24-hour discount cap.
- The Team-owns-credits model (no individual wallets, no member-to-member transfers).
- The external-payment + Admin-verification model (no payment gateway).
- The platform-role vs Team-role separation and Team-role contextuality.
- The client/server responsibility boundary (client never authoritative for money, inventory,
  permissions, or historical truth).

## Definition of Done

A feature is done when: the backend (not the client) enforces every business rule and
authorization check involved; financial/booking multi-step operations are atomic; every credit
change has a `wallet_ledger` entry and every sensitive Admin action has an
`admin_audit_logs` entry; RLS policies match the permission matrix in
`docs/product-spec.md`; and cross-Team / cross-role access has been verified to fail correctly.
