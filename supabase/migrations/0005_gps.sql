-- ============================================================================
-- 0005_gps.sql
-- Three-tier GPS storage (ADR-0003):
--   location_pings   -> append-only firehose, partitioned by month
--   current_location -> 1 row/employee, feeds the live map
--   location_history -> downsampled rollup for long-term playback
--   geofence_events  -> enter/exit transitions (authoritative, server-eval)
-- ============================================================================

create type public.geofence_event_type as enum ('enter', 'exit', 'dwell');
create type public.geofence_event_source as enum ('server', 'device');

-- ----------------------------------------------------------------------------
-- location_pings: raw firehose. PARTITION BY RANGE (recorded_at).
-- PK must include the partition key.
-- ----------------------------------------------------------------------------
create table public.location_pings (
  id           uuid not null default gen_random_uuid(),
  employee_id  uuid not null references public.profiles (id) on delete cascade,
  shift_id     uuid references public.shifts (id) on delete set null,
  location     geography(Point, 4326) not null,
  accuracy_m   numeric(7,2),
  speed_mps    numeric(7,2),
  heading_deg  numeric(5,2),
  battery_pct  smallint,
  is_moving    boolean,
  is_mock      boolean not null default false,  -- spoof signal
  recorded_at  timestamptz not null,            -- device time (ordering)
  received_at  timestamptz not null default now(),
  primary key (id, recorded_at)
) partition by range (recorded_at);

create index location_pings_emp_time_idx
  on public.location_pings (employee_id, recorded_at desc);
create index location_pings_loc_gix
  on public.location_pings using gist (location);

comment on table public.location_pings is
  'Append-only raw GPS firehose, partitioned monthly. Never read by live map.';

-- Helper: create a monthly partition if it does not exist.
create or replace function public.ensure_pings_partition(p_month date)
returns void
language plpgsql
as $$
declare
  start_date date := date_trunc('month', p_month)::date;
  end_date   date := (date_trunc('month', p_month) + interval '1 month')::date;
  part_name  text := format('location_pings_%s', to_char(start_date, 'YYYY_MM'));
begin
  if not exists (select 1 from pg_class where relname = part_name) then
    execute format(
      'create table public.%I partition of public.location_pings
         for values from (%L) to (%L);',
      part_name, start_date, end_date
    );
  end if;
end;
$$;

-- Create current + next month up front so ingest never hits a missing partition.
select public.ensure_pings_partition(now()::date);
select public.ensure_pings_partition((now() + interval '1 month')::date);

-- ----------------------------------------------------------------------------
-- current_location: exactly one row per employee. THE live-map source.
-- ----------------------------------------------------------------------------
create table public.current_location (
  employee_id  uuid primary key references public.profiles (id) on delete cascade,
  shift_id     uuid references public.shifts (id) on delete set null,
  location     geography(Point, 4326) not null,
  accuracy_m   numeric(7,2),
  speed_mps    numeric(7,2),
  heading_deg  numeric(5,2),
  battery_pct  smallint,
  is_moving    boolean,
  recorded_at  timestamptz not null,
  updated_at   timestamptz not null default now()
);

create index current_location_gix on public.current_location using gist (location);
create index current_location_updated_idx on public.current_location (updated_at desc);

comment on table public.current_location is
  'One upserted row per employee. Control-center map subscribes to this only.';

-- ----------------------------------------------------------------------------
-- location_history: downsampled rollup of aged partitions.
-- ----------------------------------------------------------------------------
create table public.location_history (
  employee_id uuid not null references public.profiles (id) on delete cascade,
  bucket_at   timestamptz not null,      -- 5-minute bucket
  location    geography(Point, 4326) not null,
  primary key (employee_id, bucket_at)
);

create index location_history_gix on public.location_history using gist (location);

-- ----------------------------------------------------------------------------
-- geofence_events: authoritative enter/exit, written server-side on ingest.
-- ----------------------------------------------------------------------------
create table public.geofence_events (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.profiles (id) on delete cascade,
  geofence_id uuid references public.geofences (id) on delete set null,
  site_id     uuid references public.sites (id) on delete set null,
  shift_id    uuid references public.shifts (id) on delete set null,
  event_type  public.geofence_event_type not null,
  source      public.geofence_event_source not null default 'server',
  location    geography(Point, 4326),
  occurred_at timestamptz not null default now(),
  is_expected boolean,                   -- e.g. exit during shift = unexpected
  created_at  timestamptz not null default now()
);

create index geofence_events_emp_idx  on public.geofence_events (employee_id, occurred_at desc);
create index geofence_events_site_idx on public.geofence_events (site_id, occurred_at desc);

comment on table public.geofence_events is
  'Authoritative geofence transitions from server-side PostGIS evaluation.';
