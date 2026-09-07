---
name: financial-integrity-review
description: Review a diff or code path touching Team wallet, booking, membership/payment, or cancellation logic against Thrill Mill Club's financial and booking invariants. Use whenever wallet balances, credit allocation, booking confirmation/cancellation, slot holds, or membership activation code is added or changed.
---

# Financial Integrity Review

Thrill Mill Club's business rules (see `CLAUDE.md` and `docs/product-spec.md`) treat financial and
booking correctness as the top priority — above every other concern including UI convenience.
This skill reviews changes touching that chain against the project's non-negotiable invariants.

## When to run this

Any diff that touches: `team_wallets`, `wallet_ledger`, `bookings`, `booking_participants`,
`slot_holds`, `turf_slots`, `payments`, `team_memberships`, membership activation, cancellation/
refund logic, or Admin credit adjustment — client code, RPC/server functions, or SQL/migrations.

## Checklist to verify against the diff

For each changed code path, confirm:

1. **No client-trusted final values.** Price, availability, hold validity, wallet balance, and
   cancellation eligibility are recomputed server-side, never accepted from the client as final.
2. **Atomicity.** Any operation that writes more than one of {wallet, ledger, booking, slot,
   participants, membership, audit log} does so in a single transaction/RPC — no
   partial-success path that leaves financial or booking state inconsistent.
3. **Ledger discipline.** Every wallet balance change (allocation, debit, refund, adjustment)
   produces exactly one `wallet_ledger` row with the right `transaction_type`, `balance_before`,
   `balance_after`, and reference to the causing record.
4. **Audit discipline.** Every sensitive Admin action (credit adjust, membership approval, Turf
   block, booking override, role change, member removal) produces an `admin_audit_logs` row
   with reason, operator, before/after state.
5. **Idempotency.** Payment verification → credit allocation, and booking confirmation, cannot
   be triggered twice for the same underlying event and produce duplicate effects (double
   credits, double debit, double booking). Look for a uniqueness/idempotency guard.
6. **Wallet non-negativity.** No code path can leave `available_credits < 0`; debit checks happen
   before, not after, the write.
7. **Slot exclusivity.** No code path allows two confirmed bookings on the same slot, or
   confirmation of an expired/released hold, or booking against a `BLOCKED` slot.
8. **Server time for cancellation.** 24-hour eligibility uses server/DB time, never a client-supplied
   timestamp or device clock.
9. **₹10,000 plan discount cap.** Rolling-24-hour discounted-hour usage (max 3) is computed from
   trusted historical booking records, not client input; cancellation restores the correct amount.
10. **Usage attribution stays analytics-only.** Per-member usage (credits ÷ final participants)
    never mutates the Team wallet or creates a per-member balance.
11. **Historical records aren't mutated in place.** Corrections use new
    adjustment/correction events, not edits/deletes of `wallet_ledger`, `payments`, completed
    `bookings`, or `admin_audit_logs` rows.

## Output

List each violation found with: file/location, which invariant it breaks, and the concrete failure
scenario (e.g. "two concurrent confirm requests could both pass the credit check before either
debits, causing a negative balance"). If everything checked out, say so plainly — don't invent
issues to pad the review.
