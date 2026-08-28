-- ============================================================================
-- 0111_sos_incident_actions.sql
-- Field SOS (raise) + control-center acknowledge / resolve.
-- ============================================================================

-- Field member raises an SOS/panic from the mobile app. Attaches their active
-- shift's site if any. Anyone authenticated may raise (safety first).
create or replace function public.raise_sos(
  p_lng double precision, p_lat double precision, p_type text default 'sos'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_site uuid;
  v_inc  uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select site_id into v_site from public.shifts
  where employee_id = v_uid and status = 'active'
  order by started_at desc nulls last limit 1;

  insert into public.incidents(type, status, raised_by, site_id, location, description)
  values (
    coalesce(p_type, 'sos')::public.incident_type, 'open', v_uid, v_site,
    case when p_lng is not null and p_lat is not null
         then ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography else null end,
    'SOS raised from the field app'
  )
  returning id into v_inc;

  return jsonb_build_object('incident_id', v_inc);
end $$;

revoke all on function public.raise_sos(double precision, double precision, text) from public;
grant execute on function public.raise_sos(double precision, double precision, text) to authenticated;

-- Control center acknowledges an incident.
create or replace function public.acknowledge_incident(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'forbidden: control-center only'; end if;
  update public.incidents
  set status = 'acknowledged', acknowledged_by = auth.uid(), acknowledged_at = now()
  where id = p_id and status = 'open';
end $$;

revoke all on function public.acknowledge_incident(uuid) from public;
grant execute on function public.acknowledge_incident(uuid) to authenticated;

-- Control center resolves an incident.
create or replace function public.resolve_incident(p_id uuid, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'forbidden: control-center only'; end if;
  update public.incidents
  set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(),
      resolution_note = nullif(p_note, '')
  where id = p_id;
end $$;

revoke all on function public.resolve_incident(uuid, text) from public;
grant execute on function public.resolve_incident(uuid, text) to authenticated;
