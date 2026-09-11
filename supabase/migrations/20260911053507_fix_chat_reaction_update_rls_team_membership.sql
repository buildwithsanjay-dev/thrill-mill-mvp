-- Code review finding: chat_message_reactions_update only checked
-- user_id = auth.uid(), unlike the insert policy which also re-verifies
-- live Team membership. A user removed from a Team after reacting once
-- could keep changing their reaction on that message indefinitely,
-- bypassing Team isolation. Bring UPDATE in line with INSERT.

drop policy chat_message_reactions_update on public.chat_message_reactions;

create policy chat_message_reactions_update on public.chat_message_reactions
  for update
  using (
    user_id = auth.uid() and exists (
      select 1 from public.chat_messages m
      join public.chat_rooms r on r.id = m.room_id
      where m.id = chat_message_reactions.message_id
        and fn_is_team_member(r.team_id)
    )
  )
  with check (
    user_id = auth.uid() and exists (
      select 1 from public.chat_messages m
      join public.chat_rooms r on r.id = m.room_id
      where m.id = chat_message_reactions.message_id
        and fn_is_team_member(r.team_id)
    )
  );
