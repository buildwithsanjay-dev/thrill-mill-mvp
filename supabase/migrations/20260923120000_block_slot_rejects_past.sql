-- Blocking a slot that has already started makes no sense (nobody can book it
-- anyway) and let an Admin write a misleading block + audit entry. Apply the
-- same rule the booking side uses for holds (SLOT_IN_PAST, decided by the
-- server clock in IST), so the Block Slot screen and Book screens agree.

create or replace function public.fn_admin_block_slot(
  p_slot_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot public.turf_slots%rowtype;
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into v_slot from public.turf_slots where id = p_slot_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0002';
  end if;

  if ((v_slot.slot_date + v_slot.start_time) at time zone 'Asia/Kolkata') <= now() then
    raise exception 'SLOT_IN_PAST' using errcode = '22023';
  end if;

  if v_slot.status not in ('AVAILABLE') then
    raise exception 'SLOT_UNAVAILABLE' using errcode = '22023';
  end if;

  update public.turf_slots
    set status = 'BLOCKED', blocked_reason = p_reason, blocked_by = auth.uid()
    where id = p_slot_id;

  insert into public.admin_audit_logs
    (admin_id, action, target_type, target_id, reason, before_state, after_state)
  values
    (auth.uid(), 'TURF_SLOT_BLOCKED', 'turf_slot', p_slot_id, p_reason,
     jsonb_build_object('status', v_slot.status), jsonb_build_object('status', 'BLOCKED'));
end;
$$;
