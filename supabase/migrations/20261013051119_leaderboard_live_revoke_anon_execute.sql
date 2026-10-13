-- fn_leaderboard_live(text, text, integer) is a brand-new function identity
-- (the earlier migration's create-or-replace couldn't inherit grants from
-- the old 2-arg version it superseded), so it picked up Postgres's default
-- EXECUTE-granted-to-PUBLIC behavior, which includes anon (fully
-- unauthenticated callers). This app's model requires auth for everything
-- (see CLAUDE.md Authentication/Authorization Rules) -- revoke anon/public,
-- keep authenticated (the app's real callers) and service_role/postgres.
revoke all on function public.fn_leaderboard_live(text, text, integer) from public, anon;
