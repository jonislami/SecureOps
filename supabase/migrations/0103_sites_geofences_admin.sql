-- ============================================================================
-- 0103_sites_geofences_admin.sql
-- Phase 3a: make sites easy to create + read from the web control center.
--   - lng/lat convenience columns on sites (kept in sync by trigger)
--   - admin_create_site(): create a site + a circular geofence in one call
-- ============================================================================

alter table public.sites
  add column if not exists lng double precision,
  add column if not exists lat double precision;

-- Keep lng/lat in sync with the geography point (so the web can read them
-- directly instead of parsing WKB).
create or replace function public.sites_sync_lnglat()
returns trigger
language plpgsql
as $$
begin
  if new.location is not null then
    new.lng := ST_X(new.location::geometry);
    new.lat := ST_Y(new.location::geometry);
  end if;
  return new;
end;
$$;

drop trigger if exists sites_sync_lnglat on public.sites;
create trigger sites_sync_lnglat
  before insert or update of location on public.sites
  for each row execute function public.sites_sync_lnglat();

-- Backfill any existing rows.
update public.sites
set lng = ST_X(location::geometry), lat = ST_Y(location::geometry)
where location is not null and (lng is null or lat is null);

-- ----------------------------------------------------------------------------
-- admin_create_site: create a protected site + a circular geofence around it.
-- Admin-only (checked inside). Takes plain lng/lat so the client never has to
-- encode geography.
-- ----------------------------------------------------------------------------
create or replace function public.admin_create_site(
  p_client   uuid,
  p_name     text,
  p_code     text,
  p_address  text,
  p_lng      double precision,
  p_lat      double precision,
  p_radius_m numeric default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site uuid;
begin
  if not public.is_admin() then
    raise exception 'forbidden: admin only';
  end if;
  if p_client is null or p_name is null or p_lng is null or p_lat is null then
    raise exception 'client, name, lng and lat are required';
  end if;

  insert into public.sites(client_id, name, code, address, location)
  values (
    p_client, p_name, nullif(p_code, ''), nullif(p_address, ''),
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography
  )
  returning id into v_site;

  insert into public.geofences(site_id, name, shape, center, radius_m)
  values (
    v_site, p_name || ' perimeter', 'circle',
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    coalesce(p_radius_m, 100)
  );

  return jsonb_build_object('site_id', v_site);
end;
$$;

revoke all on function public.admin_create_site(uuid, text, text, text, double precision, double precision, numeric) from public;
grant execute on function public.admin_create_site(uuid, text, text, text, double precision, double precision, numeric) to authenticated;
