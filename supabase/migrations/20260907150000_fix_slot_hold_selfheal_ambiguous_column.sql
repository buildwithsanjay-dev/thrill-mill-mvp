-- fn_create_slot_hold's stale-hold self-heal branch referenced a bare
-- `expires_at` in an UPDATE ... WHERE clause. Since the function's RETURNS
-- TABLE(hold_id uuid, expires_at timestamptz) implicitly declares
-- `expires_at` as a PL/pgSQL variable scoped to the whole function body,
-- that bare reference is ambiguous against slot_holds.expires_at — Postgres
-- raises 42702 "ambiguous column reference" the moment this branch runs
-- (i.e. whenever a slot is re-held after its previous hold expired without
-- an explicit release). Reproduced live against the deployed project while
-- verifying the new fn_release_slot_hold/fn_confirm_multi_slot_booking
-- flow. Fix: qualify the column with a table alias.

create or replace function public.fn_create_slot_hold(
  p_slot_id uuid,
  p_team_id uuid
)
returns table (hold_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.turf_slots%rowtype;
  v_hold_id uuid;
  v_expires timestamptz;
begin
  if not (public.fn_is_team_host_or_cohost(p_team_id) or public.fn_is_admin()) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.team_memberships
    where team_id = p_team_id and status = 'ACTIVE'
  ) then
    raise exception 'MEMBERSHIP_INACTIVE' using errcode = '22023';
  end if;

  select * into v_slot from public.turf_slots where id = p_slot_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  -- Self-heal a stale hold: if HELD but its hold already expired, release it.
  if v_slot.status = 'HELD' then
    update public.slot_holds sh
      set status = 'EXPIRED'
      where sh.slot_id = p_slot_id and sh.status = 'ACTIVE' and sh.expires_at < now();
    if found then
      v_slot.status := 'AVAILABLE';
      update public.turf_slots set status = 'AVAILABLE' where id = p_slot_id;
    end if;
  end if;

  if v_slot.status <> 'AVAILABLE' then
    raise exception 'SLOT_UNAVAILABLE' using errcode = '22023';
  end if;

  v_expires := now() + interval '1 minute';

  insert into public.slot_holds (slot_id, team_id, held_by, status, expires_at)
  values (p_slot_id, p_team_id, auth.uid(), 'ACTIVE', v_expires)
  returning id into v_hold_id;

  update public.turf_slots set status = 'HELD' where id = p_slot_id;

  return query select v_hold_id, v_expires;
end;
$$;
