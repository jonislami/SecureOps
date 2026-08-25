-- ============================================================================
-- 0105_patrols.sql
-- Phase 4: patrol checkpoints get lng/lat; admin adds checkpoints; patrol
-- officers scan them (server-verified geofence proximity).
-- ============================================================================

alter table public.checkpoints
  add column if not exists lng double precision,
  add column if not exists lat double precision;

create or replace function public.checkpoints_sync_lnglat()
returns trigger language plpgsql as $$
begin
  if new.location is not null then
    new.lng := ST_X(new.location::geometry);
    new.lat := ST_Y(new.location::geometry);
  end if;
  return new;
end;
$$;

drop trigger if exists checkpoints_sync_lnglat on public.checkpoints;
create trigger checkpoints_sync_lnglat
  before insert or update of location on public.checkpoints
  for each row execute function public.checkpoints_sync_lnglat();

update public.checkpoints
set lng = ST_X(location::geometry), lat = ST_Y(location::geometry)
where location is not null and (lng is null or lat is null);

-- ----------------------------------------------------------------------------
-- admin_add_checkpoint: staff adds an ordered checkpoint to a route.
-- ----------------------------------------------------------------------------
create or replace function public.admin_add_checkpoint(
  p_route    uuid,
  p_name     text,
  p_seq      integer,
  p_lng      double precision,
  p_lat      double precision,
  p_radius_m numeric default 25,
  p_method   text default 'geofence',
  p_tag      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_staff() then raise exception 'forbidden: staff only'; end if;

  insert into public.checkpoints(route_id, name, seq, method, location, radius_m, tag_id)
  values (
    p_route, p_name, p_seq, p_method::public.checkpoint_method,
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    coalesce(p_radius_m, 25), nullif(p_tag, '')
  )
  returning id into v_id;

  return jsonb_build_object('checkpoint_id', v_id);
end;
$$;

revoke all on function public.admin_add_checkpoint(uuid, text, integer, double precision, double precision, numeric, text, text) from public;
grant execute on function public.admin_add_checkpoint(uuid, text, integer, double precision, double precision, numeric, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- scan_checkpoint: patrol officer scans a checkpoint. Verifies the session is
-- theirs and in progress, and (for geofence method) that they are within the
-- checkpoint radius. Records the scan and returns progress.
-- ----------------------------------------------------------------------------
create or replace function public.scan_checkpoint(
  p_session    uuid,
  p_checkpoint uuid,
  p_lng        double precision,
  p_lat        double precision,
  p_method     text default 'geofence'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_session public.patrol_sessions%rowtype;
  v_cp      public.checkpoints%rowtype;
  v_pt      geography := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;
  v_inside  boolean;
  v_total   int;
  v_done    int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select * into v_session from public.patrol_sessions where id = p_session;
  if v_session.id is null then raise exception 'session not found'; end if;
  if v_session.employee_id <> v_uid then raise exception 'not your patrol'; end if;
  if v_session.status <> 'in_progress' then raise exception 'patrol is not in progress'; end if;

  select * into v_cp from public.checkpoints where id = p_checkpoint;
  if v_cp.id is null then raise exception 'checkpoint not found'; end if;
  if v_cp.route_id <> v_session.route_id then raise exception 'checkpoint not on this route'; end if;

  v_inside := ST_DWithin(v_cp.location, v_pt, coalesce(v_cp.radius_m, 25));
  if p_method = 'geofence' and not v_inside then
    raise exception 'You are not at this checkpoint';
  end if;

  insert into public.checkpoint_scans(
    session_id, checkpoint_id, employee_id, scanned_at, location, method, in_geofence
  )
  values (p_session, p_checkpoint, v_uid, now(), v_pt, p_method::public.checkpoint_method, v_inside);

  select count(*) into v_total from public.checkpoints where route_id = v_session.route_id;
  select count(distinct checkpoint_id) into v_done
  from public.checkpoint_scans where session_id = p_session;

  return jsonb_build_object('scanned', v_done, 'total', v_total, 'in_geofence', v_inside);
end;
$$;

revoke all on function public.scan_checkpoint(uuid, uuid, double precision, double precision, text) from public;
grant execute on function public.scan_checkpoint(uuid, uuid, double precision, double precision, text) to authenticated;
