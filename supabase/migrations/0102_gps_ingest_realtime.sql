-- ============================================================================
-- 0102_gps_ingest_realtime.sql
-- Phase 2: GPS ingest RPC (server-authoritative), lng/lat convenience columns
-- on current_location, and Realtime enablement for the live map.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Convenience lng/lat columns on current_location.
-- The live map (and Realtime payloads) can read these directly instead of
-- parsing the geography WKB. Kept in sync by ingest_locations().
-- ----------------------------------------------------------------------------
alter table public.current_location
  add column if not exists lng double precision,
  add column if not exists lat double precision;

-- ----------------------------------------------------------------------------
-- ingest_locations: the authoritative write path for GPS.
-- Called by the authenticated field user (or a simulator signed in as one).
-- SECURITY DEFINER so it can write firehose + live-state + events atomically,
-- but it pins employee_id to auth.uid() so a caller can only submit their own.
--   p_pings : jsonb array of { lng, lat, accuracyM?, speedMps?, headingDeg?,
--             batteryPct?, isMoving?, isMock?, recordedAt(ISO) }
--   p_shift : optional active shift id
-- Returns   : { accepted, lng, lat, events }
-- ----------------------------------------------------------------------------
create or replace function public.ingest_locations(p_pings jsonb, p_shift uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_ping   jsonb;
  v_last   jsonb;
  v_prev   geography;
  v_new    geography;
  v_lng    double precision;
  v_lat    double precision;
  v_count  int := 0;
  v_events int := 0;
  v_gf     record;
  v_now_in boolean;
  v_was_in boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_pings is null or jsonb_typeof(p_pings) <> 'array' or jsonb_array_length(p_pings) = 0 then
    return jsonb_build_object('accepted', 0);
  end if;

  -- Remember the previous live point BEFORE we upsert (for geofence transitions).
  select location into v_prev from public.current_location where employee_id = v_uid;

  -- 1) Firehose: insert every ping.
  for v_ping in select * from jsonb_array_elements(p_pings)
  loop
    insert into public.location_pings(
      employee_id, shift_id, location, accuracy_m, speed_mps, heading_deg,
      battery_pct, is_moving, is_mock, recorded_at
    )
    values (
      v_uid, p_shift,
      ST_SetSRID(ST_MakePoint((v_ping->>'lng')::double precision,
                              (v_ping->>'lat')::double precision), 4326)::geography,
      nullif(v_ping->>'accuracyM','')::numeric,
      nullif(v_ping->>'speedMps','')::numeric,
      nullif(v_ping->>'headingDeg','')::numeric,
      nullif(v_ping->>'batteryPct','')::int,
      (v_ping->>'isMoving')::boolean,
      coalesce((v_ping->>'isMock')::boolean, false),
      (v_ping->>'recordedAt')::timestamptz
    );
    v_count := v_count + 1;
  end loop;

  -- 2) Latest point in the batch (by device time) -> live state.
  select e into v_last
  from jsonb_array_elements(p_pings) e
  order by (e->>'recordedAt')::timestamptz desc
  limit 1;

  v_lng := (v_last->>'lng')::double precision;
  v_lat := (v_last->>'lat')::double precision;
  v_new := ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)::geography;

  insert into public.current_location(
    employee_id, shift_id, location, lng, lat, accuracy_m, speed_mps,
    heading_deg, battery_pct, is_moving, recorded_at, updated_at
  )
  values (
    v_uid, p_shift, v_new, v_lng, v_lat,
    nullif(v_last->>'accuracyM','')::numeric,
    nullif(v_last->>'speedMps','')::numeric,
    nullif(v_last->>'headingDeg','')::numeric,
    nullif(v_last->>'batteryPct','')::int,
    (v_last->>'isMoving')::boolean,
    (v_last->>'recordedAt')::timestamptz, now()
  )
  on conflict (employee_id) do update set
    shift_id = excluded.shift_id, location = excluded.location,
    lng = excluded.lng, lat = excluded.lat, accuracy_m = excluded.accuracy_m,
    speed_mps = excluded.speed_mps, heading_deg = excluded.heading_deg,
    battery_pct = excluded.battery_pct, is_moving = excluded.is_moving,
    recorded_at = excluded.recorded_at, updated_at = now();

  -- 3) Geofence evaluation (authoritative). Compare previous vs new containment.
  -- NOTE: iterates active geofences. For 10k+ sites, Phase 3 adds a spatial
  -- pre-filter (GiST index on geography) so only nearby geofences are checked.
  for v_gf in select * from public.geofences where is_active loop
    v_now_in := case
      when v_gf.shape = 'polygon' then ST_Covers(v_gf.area, v_new)
      when v_gf.shape = 'circle'  then ST_DWithin(v_gf.center, v_new, v_gf.radius_m)
      else false end;
    v_was_in := case
      when v_prev is null then false
      when v_gf.shape = 'polygon' then ST_Covers(v_gf.area, v_prev)
      when v_gf.shape = 'circle'  then ST_DWithin(v_gf.center, v_prev, v_gf.radius_m)
      else false end;

    if v_now_in and not v_was_in then
      insert into public.geofence_events(
        employee_id, geofence_id, site_id, shift_id, event_type, source, location, is_expected
      ) values (v_uid, v_gf.id, v_gf.site_id, p_shift, 'enter', 'server', v_new, true);
      v_events := v_events + 1;
    elsif v_was_in and not v_now_in then
      insert into public.geofence_events(
        employee_id, geofence_id, site_id, shift_id, event_type, source, location, is_expected
      ) values (v_uid, v_gf.id, v_gf.site_id, p_shift, 'exit', 'server', v_new, null);
      v_events := v_events + 1;
    end if;
  end loop;

  return jsonb_build_object('accepted', v_count, 'lng', v_lng, 'lat', v_lat, 'events', v_events);
end;
$$;

revoke all on function public.ingest_locations(jsonb, uuid) from public;
grant execute on function public.ingest_locations(jsonb, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Realtime: publish current_location changes to the control-center live map.
-- RLS still applies to subscribers (current_location_select).
-- ----------------------------------------------------------------------------
alter table public.current_location replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.current_location;
exception
  when duplicate_object then null;   -- already in the publication
  when undefined_object then
    raise notice 'publication supabase_realtime not found; skipping (Realtime may be disabled).';
end $$;
