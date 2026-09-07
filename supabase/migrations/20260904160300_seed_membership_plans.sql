-- Thrill Mill Club — fixed membership plans
-- Per CLAUDE.md "Things That Must Not Be Changed Without Explicit Approval":
-- these two plans' pricing and the ₹10,000 plan's 3-hour/rolling-24h cap must
-- not change without the user's explicit approval.

insert into public.membership_plans
  (code, name, price_inr, membership_rate_per_hour, standard_rate_per_hour, discounted_hours_cap_per_24h, is_active)
values
  ('PLAN_10K', '₹10,000 Membership', 10000, 800, 1000, 3, true),
  ('PLAN_25K', '₹25,000 Membership', 25000, 800, 800, null, true);
