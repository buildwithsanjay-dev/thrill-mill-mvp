---
name: release-security-checklist
description: Run Thrill Mill Club's production security validation checklist before a release or PR is considered done. Use before merging/releasing changes to auth, roles, wallet, booking, payment, or Admin functionality.
---

# Release Security Checklist

Before treating a release or PR touching auth/roles/wallet/booking/payment/Admin functionality
as done, verify each item below explicitly (don't just assume from code review — check for a
test, a manual verification step, or explicit reasoning per item). Source: blueprint §9.30 and
`CLAUDE.md` security requirements.

## Checklist

- [ ] A plain Member cannot modify a Team wallet balance through any exposed path.
- [ ] A user cannot read or write another Team's data by supplying a different `team_id`
      (cross-Team isolation holds even when the client is adversarial).
- [ ] A non-Admin user cannot reach any Admin-only operation (Turf block/unblock, credit
      adjustment, membership verification/activation, Admin-assisted booking, role change,
      member removal), even by calling the endpoint/RPC directly.
- [ ] Host/Co-host permissions are enforced per-Team — a Host in Team A gets no privilege in
      Team B.
- [ ] An expired slot hold cannot be confirmed into a booking (server timestamp governs, not
      client clock).
- [ ] The same Turf slot cannot end up with two confirmed bookings under concurrent requests.
- [ ] A single verified payment/membership activation cannot allocate Team credits more than
      once, including on retry.
- [ ] A refund/cancellation cannot be executed twice for the same booking.
- [ ] No code path can drive `team_wallets.available_credits` negative.
- [ ] The client cannot set or influence the final booking price — it's always server-recalculated.
- [ ] The ₹10,000 plan's 3-hour/rolling-24-hour discount cap cannot be bypassed via request
      parameters or timing tricks.
- [ ] Cancellation cannot bypass the 24-hour refund-eligibility rule.
- [ ] Every manual Admin credit adjustment produces both a `wallet_ledger` row and an
      `admin_audit_logs` row (amount, reason, operator, timestamp).
- [ ] Historical `wallet_ledger`, `payments`, completed `bookings`, and `admin_audit_logs`
      records cannot be silently edited or deleted through the app.
- [ ] Team chat access is isolated by Team membership.
- [ ] No privileged secret (Supabase service-role key, server-side credentials) is present in the
      Expo client bundle, source code, or committed config.
- [ ] User-facing error messages are structured business outcomes (e.g.
      `INSUFFICIENT_CREDITS`, `HOLD_EXPIRED`) — no raw DB errors, stack traces, or
      infrastructure details reach the client.

## Output

For each unchecked item, state what's missing and where (file/RPC/policy). For each checked
item, briefly say how it's enforced (e.g. "RLS policy X" / "RPC re-validates role before write" /
test name). Do not mark an item checked without a concrete reason — "looks fine" is not
sufficient for this checklist.
