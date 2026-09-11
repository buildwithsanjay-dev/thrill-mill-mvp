# Team chat (preset messages + emoji reactions) — design

Status: approved by user (in-chat), 2026-09-11. Sub-project 3 of 3 from the
multi-sport feature request (sub-projects 1 and 2 — pricing/Pickleball and
credit-usage visibility — are separate, already-decided-or-done work).

## Why

Teams want a lightweight, game-related chat, explicitly NOT a general
messaging app like WhatsApp/Discord — no freeform typing, so there is no
possible path for abusive/violating text to ever reach the database. Every
message is a tap from a fixed catalog; emoji are reactions on messages, not
their own message type.

## What already exists (verified against the live DB before writing this)

- `chat_rooms` (id, team_id, created_at) — one row per Team, already
  auto-created by both `fn_create_team` and `fn_admin_create_team`. Nothing
  to change here.
- `chat_messages` (id, room_id, sender_id, body, is_deleted, created_at) —
  exists but unused (0 rows), built for freeform text.
- RLS already in place and correctly scoped:
  - `chat_rooms_select`: `fn_is_team_member(team_id) OR fn_is_admin()`
  - `chat_messages_select`: same team-membership check via the room's `team_id`
  - `chat_messages_insert`: `sender_id = auth.uid()` AND caller is a member
    of that room's Team
  - `chat_messages_soft_delete` (UPDATE, i.e. `is_deleted`): sender, Admin,
    or that Team's Host/Co-host
- Since RLS already permits **direct** client inserts (not RPC-gated), the
  security boundary for "no violating text" is achieved by making the
  message content itself impossible to be freeform — a foreign key on the
  new `preset_key` column, not a new RPC layer. This matches the existing
  pattern (direct insert under RLS) already used here rather than
  introducing an inconsistent RPC-gated write path.

## Data model changes

### New table: `chat_preset_catalog`
Fixed reference data, not admin-editable in this pass (no such UI was
requested — YAGNI).

```
key text primary key
category text not null  -- 'ARRIVAL' | 'GAME' | 'LOGISTICS' | 'QUICK_REPLY'
text text not null
sort_order integer not null
```

Seeded with ~15 presets:
- **ARRIVAL**: on my way, running 5 min late, running 10 min late, I'm here, can't make it today
- **GAME**: let's go team, great game everyone, nice shot, who's in for next week
- **LOGISTICS**: bringing the ball, can someone bring water, see you at the turf, booking confirmed
- **QUICK_REPLY**: yes, no, maybe, count me in

### `chat_messages` reworked
- Drop `body` (freeform text — no longer the model).
- Add `preset_key text not null references chat_preset_catalog(key)`.
- Existing RLS policies are unchanged — they never referenced `body`, so no
  policy rewrite needed; the FK is what closes off freeform content.

### New table: `chat_message_reactions`
```
id uuid primary key default gen_random_uuid()
message_id uuid not null references chat_messages(id)
user_id uuid not null references profiles(id)
emoji text not null check (emoji in ('👍','❤️','😂','😮','😢','👏'))
created_at timestamptz not null default now()
unique (message_id, user_id)  -- one reaction per user per message; a new
                               -- tap replaces the old one (upsert)
```
RLS: select scoped the same way as `chat_messages_select` (via the
message's room's Team membership); insert/update (upsert) requires
`user_id = auth.uid()` AND the same Team-membership check.

## Client

New `mobile/src/features/chat/` module:
- `api.ts` — `getChatRoom(teamId)`, `getMessages(roomId)`, `sendMessage(roomId, presetKey)` (plain insert, RLS-gated), `getReactions(messageIds)`, `setReaction(messageId, emoji)` (upsert), `getPresetCatalog()` (static import, not a query — it's fixed data, no need to round-trip the DB for a list that never changes at runtime).
- `useChat.ts` — TanStack Query hooks + a Supabase Realtime subscription on `chat_messages` (and `chat_message_reactions`) filtered to the room, invalidating the message list query on insert/update.
- `ChatScreen.tsx` — message feed (chat bubbles, own messages right-aligned per existing app conventions elsewhere), tap-to-react emoji row under each message, and a bottom preset-picker (grouped by category, horizontally scrollable chips or a bottom sheet — implementation detail decided during build, following this app's existing component patterns).
- Entry point: a "Team Chat" row/button added to `TeamDetailsScreen.tsx`, navigating to a new route `app/(app)/team/[id]/chat.tsx`.

## Testing

Not financial/booking-critical (no wallet/credit/booking interaction), so
CLAUDE.md's Testing Requirements don't mandate automated tests here. Manual
verification: two different Team members can see each other's messages in
real time, cannot see another Team's chat, a message's `preset_key` FK
rejects anything not in the catalog (proving the "no freeform" boundary
holds even if bypassed client-side), and reactions upsert correctly (second
tap with a different emoji replaces the first).

## Out of scope

Admin-editable preset catalog, message deletion UI (the `is_deleted`/
soft-delete RLS policy already exists but no UI is being built for it in
this pass — can be added later without schema changes), push notifications
for new chat messages, read receipts.
