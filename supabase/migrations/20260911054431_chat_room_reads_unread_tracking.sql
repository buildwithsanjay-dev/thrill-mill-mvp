-- Per-user "last read" marker per chat room, so the client can compute an
-- unread indicator (dashboard red dot) that persists until the user
-- actually opens that Team's chat.

create table public.chat_room_reads (
  room_id uuid not null references public.chat_rooms(id),
  user_id uuid not null references public.profiles(id),
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.chat_room_reads enable row level security;

create policy chat_room_reads_select on public.chat_room_reads
  for select
  using (user_id = auth.uid());

create policy chat_room_reads_insert on public.chat_room_reads
  for insert
  with check (
    user_id = auth.uid() and exists (
      select 1 from public.chat_rooms r
      where r.id = chat_room_reads.room_id and fn_is_team_member(r.team_id)
    )
  );

create policy chat_room_reads_update on public.chat_room_reads
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
