-- ============================================================================
-- 0003_clients_sites_geofences.sql
-- Clients (customers), protected sites, zones, and geofences.
-- ============================================================================

create type public.geofence_shape as enum ('polygon', 'circle');

-- ----------------------------------------------------------------------------
-- clients: the security company's customers (site owners). Data only.
-- ----------------------------------------------------------------------------
create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact_name  text,
  contact_phone text,
  contact_email text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- zones: geographic grouping of sites / patrol areas.
-- ----------------------------------------------------------------------------
create table public.zones (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  area       geography(Polygon, 4326),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index zones_area_gix on public.zones using gist (area);

create trigger zones_set_updated_at
  before update on public.zones
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- sites: protected locations.
-- ----------------------------------------------------------------------------
create table public.sites (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients (id) on delete restrict,
  zone_id     uuid references public.zones (id) on delete set null,
  name        text not null,
  code        text unique,
  address     text,
  location    geography(Point, 4326) not null,
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create index sites_location_gix on public.sites using gist (location);
create index sites_client_idx on public.sites (client_id);
create index sites_zone_idx on public.sites (zone_id);

create trigger sites_set_updated_at
  before update on public.sites
  for each row execute function public.set_updated_at();

comment on table public.sites is 'Protected locations. Scales to 10,000+ rows.';

-- ----------------------------------------------------------------------------
-- geofences: authoritative boundary for a site (polygon or circle).
-- ----------------------------------------------------------------------------
create table public.geofences (
  id         uuid primary key default gen_random_uuid(),
  site_id    uuid references public.sites (id) on delete cascade,
  name       text not null,
  shape      public.geofence_shape not null,
  -- For polygon geofences:
  area       geography(Polygon, 4326),
  -- For circle geofences:
  center     geography(Point, 4326),
  radius_m   numeric(8,2),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Ensure the right columns are populated for the chosen shape.
  constraint geofence_shape_valid check (
    (shape = 'polygon' and area is not null)
    or
    (shape = 'circle' and center is not null and radius_m is not null)
  )
);

create index geofences_area_gix   on public.geofences using gist (area);
create index geofences_center_gix on public.geofences using gist (center);
create index geofences_site_idx   on public.geofences (site_id);

create trigger geofences_set_updated_at
  before update on public.geofences
  for each row execute function public.set_updated_at();

comment on table public.geofences is
  'Authoritative geofence per site. Server evaluates ST_Covers/ST_DWithin.';
