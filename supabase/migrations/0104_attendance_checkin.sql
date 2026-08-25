-- ============================================================================
-- 0104_attendance_checkin.sql
-- Phase 3c: server-authoritative attendance. check_in verifies the guard is
-- physically inside the site's geofence before recording attendance; check_out
-- closes the open record. Both pin the employee to auth.uid().
-- ============================================================================

create or replace function public.check_in(
  p_shift uuid,
  p_lng   double precision,
  p_lat   double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_shift public.shifts%rowtype;
  v_pt    geography := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  v_gf    public.geofences%rowtype;
  v_inside boolean := true;
  v_att   uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_shift from public.shifts where id = p_shift;
  if v_shift.id is null then raise exception 'shift not found'; end if;
  if v_shift.employee_id <> v_uid then raise exception 'not your shift'; end if;

  -- Geofence gate (only if the site has an active geofence).
  if v_shift.site_id is not null then
    select * into v_gf
    from public.geofences
    where site_id = v_shift.site_id and is_active
    limit 1;
    if v_gf.id is not null then
      v_inside := case
        when v_gf.shape = 'polygon' then ST_Covers(v_gf.area, v_pt)
        when v_gf.shape = 'circle'  then ST_DWithin(v_gf.center, v_pt, v_gf.radius_m)
        else true end;
    end if;
  end if;

  if not v_inside then
    raise exception 'You are not inside the site perimeter';
  end if;

  -- Idempotent: if already checked in (open record), return it.
  select id into v_att
  from public.attendance
  where shift_id = p_shift and employee_id = v_uid and check_out_at is null
  limit 1;
  if v_att is not null then
    return jsonb_build_object('attendance_id', v_att, 'already_checked_in', true);
  end if;

  insert into public.attendance(
    shift_id, employee_id, site_id, check_in_at, check_in_loc, method, status
  )
  values (p_shift, v_uid, v_shift.site_id, now(), v_pt, 'gps_geofence', 'verified')
  returning id into v_att;

  return jsonb_build_object('attendance_id', v_att, 'status', 'verified', 'checked_in_at', now());
end;
$$;

create or replace function public.check_out(
  p_shift uuid,
  p_lng   double precision,
  p_lat   double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_pt  geography := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  v_att uuid;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select id into v_att
  from public.attendance
  where shift_id = p_shift and employee_id = v_uid and check_out_at is null
  order by check_in_at desc
  limit 1;
  if v_att is null then raise exception 'no open check-in for this shift'; end if;

  update public.attendance
  set check_out_at = now(), check_out_loc = v_pt
  where id = v_att;

  return jsonb_build_object('attendance_id', v_att, 'checked_out_at', now());
end;
$$;

revoke all on function public.check_in(uuid, double precision, double precision) from public;
revoke all on function public.check_out(uuid, double precision, double precision) from public;
grant execute on function public.check_in(uuid, double precision, double precision) to authenticated;
grant execute on function public.check_out(uuid, double precision, double precision) to authenticated;
