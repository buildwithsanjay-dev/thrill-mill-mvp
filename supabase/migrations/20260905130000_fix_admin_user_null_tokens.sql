-- Fixes the seeded admin user (20260905094500_seed_admin_user.sql), whose
-- direct INSERT into auth.users left confirmation_token/recovery_token/
-- email_change_token_new/email_change as NULL. GoTrue's Go SQL driver
-- scans those columns as non-nullable strings, so every sign-in attempt
-- for this user failed with a 500 ("error finding user: sql: Scan error
-- ... converting NULL to string is unsupported") surfaced to the app as a
-- generic "incorrect username or password". The seed migration itself is
-- fixed for future environments; this repairs the row already live here.
update auth.users
set confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change = coalesce(email_change, '')
where email = 'admin@thrillmillclub.internal';
