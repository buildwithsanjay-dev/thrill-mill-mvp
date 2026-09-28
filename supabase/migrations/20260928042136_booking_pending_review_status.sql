-- Owner feedback (2026-09-28): a customer's booking must not show as
-- Confirmed the instant it's made -- the Admin needs to manually cross-check
-- the slot against TurfTown (a separate real-world system the club also uses)
-- before it's actually confirmed. This adds the new booking_status value the
-- rest of this feature depends on. Split into its own migration because
-- Postgres will not let a new enum value be used by name in the same
-- transaction that adds it.
alter type public.booking_status add value if not exists 'PENDING_REVIEW';
