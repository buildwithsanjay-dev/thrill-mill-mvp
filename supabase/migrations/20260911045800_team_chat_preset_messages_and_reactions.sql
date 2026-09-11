-- Team chat: preset-only messages + emoji reactions, per
-- docs/superpowers/specs/2026-09-11-team-chat-design.md.
--
-- No freeform text is ever accepted — chat_messages.preset_key is a FK
-- into a fixed catalog, so there is no code path (even bypassing the
-- client) that can insert arbitrary/violating text. The existing
-- chat_messages RLS policies (insert/select/soft_delete) are untouched;
-- none of them reference the old `body` column.

-- 1. Fixed preset catalog ------------------------------------------------
create table public.chat_preset_catalog (
  key text primary key,
  category text not null check (category in ('ARRIVAL', 'GAME', 'LOGISTICS', 'QUICK_REPLY')),
  text text not null,
  sort_order integer not null
);

alter table public.chat_preset_catalog enable row level security;

create policy chat_preset_catalog_select on public.chat_preset_catalog
  for select
  using (true); -- fixed, non-sensitive reference data — readable by anyone authenticated

insert into public.chat_preset_catalog (key, category, text, sort_order) values
  ('on_my_way', 'ARRIVAL', 'On my way 🏃', 1),
  ('running_5_late', 'ARRIVAL', 'Running 5 min late', 2),
  ('running_10_late', 'ARRIVAL', 'Running 10 min late', 3),
  ('im_here', 'ARRIVAL', 'I''m here!', 4),
  ('cant_make_it', 'ARRIVAL', 'Can''t make it today', 5),
  ('lets_go_team', 'GAME', 'Let''s go team! 💪', 6),
  ('great_game', 'GAME', 'Great game everyone! 🎉', 7),
  ('nice_shot', 'GAME', 'Nice shot!', 8),
  ('whos_in_next_week', 'GAME', 'Who''s in for next week?', 9),
  ('bringing_ball', 'LOGISTICS', 'Bringing the ball', 10),
  ('need_water', 'LOGISTICS', 'Can someone bring water?', 11),
  ('see_you_at_turf', 'LOGISTICS', 'See you at the turf', 12),
  ('booking_confirmed', 'LOGISTICS', 'Booking confirmed ✅', 13),
  ('yes', 'QUICK_REPLY', 'Yes 👍', 14),
  ('no', 'QUICK_REPLY', 'No 👎', 15),
  ('maybe', 'QUICK_REPLY', 'Maybe', 16),
  ('count_me_in', 'QUICK_REPLY', 'Count me in!', 17);

-- 2. chat_messages: freeform body -> fixed preset_key --------------------
alter table public.chat_messages
  add column preset_key text references public.chat_preset_catalog(key);

update public.chat_messages set preset_key = 'yes' where preset_key is null;
-- (no-op today — 0 rows exist — but keeps the column backfill-safe if
-- this migration is ever re-run against a DB with legacy freeform rows)

alter table public.chat_messages
  alter column preset_key set not null,
  drop column body;

-- 3. Reactions ------------------------------------------------------------
create table public.chat_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages(id),
  user_id uuid not null references public.profiles(id),
  emoji text not null check (emoji in ('👍', '❤️', '😂', '😮', '😢', '👏')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id)
);

alter table public.chat_message_reactions enable row level security;

create policy chat_message_reactions_select on public.chat_message_reactions
  for select
  using (
    fn_is_admin() or exists (
      select 1 from public.chat_messages m
      join public.chat_rooms r on r.id = m.room_id
      where m.id = chat_message_reactions.message_id
        and fn_is_team_member(r.team_id)
    )
  );

create policy chat_message_reactions_upsert on public.chat_message_reactions
  for insert
  with check (
    user_id = auth.uid() and exists (
      select 1 from public.chat_messages m
      join public.chat_rooms r on r.id = m.room_id
      where m.id = chat_message_reactions.message_id
        and fn_is_team_member(r.team_id)
    )
  );

create policy chat_message_reactions_update on public.chat_message_reactions
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
