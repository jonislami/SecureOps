-- ============================================================================
-- seed.sql — minimal local dev seed. Runs after migrations on `supabase db reset`.
-- NOTE: real users come from auth.users; this seeds reference data only so the
-- schema can be exercised locally. Employee/role seeding happens once auth users
-- exist (see docs; Phase 1 provides an admin bootstrap script).
-- ============================================================================

insert into public.clients (id, name, contact_name, contact_phone)
values
  ('00000000-0000-0000-0000-000000000001', 'Acme Retail Group', 'Site Manager', '+10000000001'),
  ('00000000-0000-0000-0000-000000000002', 'Harbor Logistics',  'Ops Desk',     '+10000000002')
on conflict (id) do nothing;

insert into public.zones (id, name)
values
  ('00000000-0000-0000-0000-0000000000a1', 'Downtown'),
  ('00000000-0000-0000-0000-0000000000a2', 'Industrial East')
on conflict (id) do nothing;

-- Two example sites (lon/lat -> ST_MakePoint(lon, lat)).
insert into public.sites (id, client_id, zone_id, name, code, address, location)
values
  ('00000000-0000-0000-0000-0000000000b1',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-0000000000a1',
   'Acme Store #1', 'ACME-01', '1 Market St',
   ST_SetSRID(ST_MakePoint(-73.9857, 40.7484), 4326)::geography),
  ('00000000-0000-0000-0000-0000000000b2',
   '00000000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-0000000000a2',
   'Harbor Warehouse', 'HARB-01', '200 Dock Rd',
   ST_SetSRID(ST_MakePoint(-74.0060, 40.7128), 4326)::geography)
on conflict (id) do nothing;

-- A circular geofence (100 m) around each site.
insert into public.geofences (site_id, name, shape, center, radius_m)
select id, name || ' perimeter', 'circle', location, 100
from public.sites
where id in ('00000000-0000-0000-0000-0000000000b1',
             '00000000-0000-0000-0000-0000000000b2')
on conflict do nothing;
