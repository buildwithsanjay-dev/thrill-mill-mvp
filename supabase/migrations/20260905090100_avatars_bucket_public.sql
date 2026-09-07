-- Correction to 20260905090000: a private bucket can't be resolved with
-- supabase.storage.from(...).getPublicUrl() (no auth header on that URL, so
-- Storage 400s regardless of the RLS read policy already in place — RLS
-- only gates the authenticated API path, not the public CDN path). Avatars
-- aren't sensitive data, so make the bucket public rather than switching the
-- client to signed URLs (which expire and would need re-resolving on every
-- read). The avatars_authenticated_read policy stays — it still gates
-- listing/downloading via the authenticated storage API.

update storage.buckets set public = true where id = 'avatars';
