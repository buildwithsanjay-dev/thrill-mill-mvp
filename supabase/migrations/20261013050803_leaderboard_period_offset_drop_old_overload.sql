-- The prior migration's `create or replace function ... (text, text, integer default 0)`
-- did not replace the original 2-argument fn_leaderboard_live(text, text) —
-- Postgres treats a different parameter list as a distinct overload, so both
-- now existed, which is ambiguous for any untyped/positional caller. Drop
-- the old overload so there is exactly one fn_leaderboard_live again.
drop function if exists public.fn_leaderboard_live(text, text);
