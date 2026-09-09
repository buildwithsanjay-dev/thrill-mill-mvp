-- fn_admin_audit_log_feed gains an optional p_team_id filter, so the Admin
-- Team Details ("Network Details") page can show that specific Team's own
-- audit trail (membership approvals, credit adjustments, role changes,
-- booking overrides made for it) instead of only the global Admin Logs
-- feed on the Leaderboard tab. Additive/backward-compatible: existing
-- callers (Leaderboard's Admin Logs, Admin Home's Recent Activity) pass no
-- team_id and see every log, unfiltered, exactly as before.
--
-- Team resolution mirrors the existing target_label CASE per target_type:
--   team_wallet     -> target_id IS the team_id directly
--   team_membership -> resolved via team_memberships.team_id
--   team_member     -> resolved via team_members.team_id
--   booking         -> resolved via bookings.team_id
--   turf_slot       -> no Team association (Turf blocking isn't Team-
--                      scoped) — such rows simply never match a team_id
--                      filter, which is correct.
-- Postgres identifies a function by name + parameter TYPES, not by name
-- alone — `create or replace` with an added parameter creates a second,
-- overloaded 5-arg function alongside the existing 4-arg one rather than
-- replacing it, and since the new parameter has a default, a 4-arg call
-- becomes ambiguous between the two candidates. Drop the old signature
-- first so this is a genuine replacement.
drop function if exists public.fn_admin_audit_log_feed(integer, text, date, date);

create or replace function public.fn_admin_audit_log_feed(
  p_limit integer default 20,
  p_action text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_team_id uuid default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 500));
  v_rows jsonb;
begin
  if not public.fn_is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    into v_rows
  from (
    select
      l.id,
      l.action,
      l.reason,
      l.created_at,
      l.target_type,
      l.target_id,
      l.admin_id,
      coalesce(ap.full_name, 'Admin') as admin_name,
      case l.target_type
        when 'team_wallet' then wteam.name
        when 'team_membership' then mteam.name
        when 'turf_slot' then coalesce(tr.name, 'Turf') || ' · ' || to_char(ts.slot_date, 'DD Mon') || ' ' ||
                              to_char(ts.start_time, 'HH12:MI AM')
        when 'team_member' then coalesce(mp.full_name, 'Member') ||
                                 case when rteam.name is not null then ' · ' || rteam.name else '' end
        when 'booking' then coalesce(bteam.name, 'Team') || ' · ' || coalesce(btr.name, 'Turf') || ' · ' ||
                             to_char(b.booking_date, 'DD Mon')
        else null
      end as target_label,
      case l.target_type
        when 'team_wallet' then wteam.id
        when 'team_membership' then tm.team_id
        when 'team_member' then rtm.team_id
        when 'booking' then b.team_id
        else null
      end as resolved_team_id
    from public.admin_audit_logs l
    left join public.profiles ap on ap.id = l.admin_id
    left join public.teams wteam on l.target_type = 'team_wallet' and wteam.id = l.target_id
    left join public.team_memberships tm on l.target_type = 'team_membership' and tm.id = l.target_id
    left join public.teams mteam on mteam.id = tm.team_id
    left join public.turf_slots ts on l.target_type = 'turf_slot' and ts.id = l.target_id
    left join public.turf_resources tr on tr.id = ts.turf_id
    left join public.team_members rtm on l.target_type = 'team_member' and rtm.id = l.target_id
    left join public.profiles mp on mp.id = rtm.user_id
    left join public.teams rteam on rteam.id = rtm.team_id
    left join public.bookings b on l.target_type = 'booking' and b.id = l.target_id
    left join public.teams bteam on bteam.id = b.team_id
    left join public.turf_resources btr on btr.id = b.turf_id
    where (p_action is null or l.action = p_action)
      and (p_date_from is null or (l.created_at at time zone 'Asia/Kolkata')::date >= p_date_from)
      and (p_date_to is null or (l.created_at at time zone 'Asia/Kolkata')::date <= p_date_to)
      and (
        p_team_id is null
        or wteam.id = p_team_id
        or tm.team_id = p_team_id
        or rtm.team_id = p_team_id
        or b.team_id = p_team_id
      )
    order by l.created_at desc
    limit v_limit
  ) t;

  return v_rows;
end;
$$;

revoke all on function public.fn_admin_audit_log_feed(integer, text, date, date, uuid) from public, anon;
grant execute on function public.fn_admin_audit_log_feed(integer, text, date, date, uuid) to authenticated;
