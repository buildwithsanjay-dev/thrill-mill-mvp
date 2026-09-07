-- tg_teams_generate_join_code is a BEFORE INSERT trigger function only; it
-- has no business being directly RPC-callable (the security advisor
-- flagged it as anon-executable after the previous migration created it).
revoke all on function public.tg_teams_generate_join_code() from public, anon, authenticated;
