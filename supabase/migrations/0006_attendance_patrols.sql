-- ============================================================================
-- 0006_attendance_patrols.sql
-- Attendance (check-in/out) and patrols (routes, checkpoints, sessions, scans).
-- ============================================================================

create type public.attendance_method as enum ('gps_geofence', 'manual', 'qr', 'nfc');
create type public.attendance_status as enum ('pending', 'verified', 'rejected', 'flagged');
create type public.checkpoint_method as enum ('geofence', 'qr', 'nfc');
create type public.patrol_status as enum ('in_progress', 'completed', 'abandoned');

-- ----------------------------------------------------------------------------
-- attendance: check-in / check-out against a shift.
-- ----------------------------------------------------------------------------
create table public.attendance (
  id               uuid primary key default gen_random_uuid(),
  shift_id         uuid not null references public.shifts (id) on delete cascade,
  employee_id      uuid not null references public.profiles (id) on delete cascade,
  site_id          uuid references public.sites (id) on delete set null,
  check_in_at      timestamptz,
  check_in_loc     geography(Point, 4326),
  check_out_at     timestamptz,
  check_out_loc    geography(Point, 4326),
  method           public.attendance_method not null default 'gps_geofence',
  status           public.attendance_status not null default 'pending',
  -- Idempotency for offline sync (client-generated).
  client_ref       uuid unique,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index attendance_employee_idx on public.attendance (employee_id, check_in_at desc);
create index attendance_shift_idx    on public.attendance (shift_id);

create trigger attendance_set_updated_at
  before update on public.attendance
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- patrol_routes + checkpoints
-- ----------------------------------------------------------------------------
create table public.patrol_routes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  site_id     uuid references public.sites (id) on delete set null,
  zone_id     uuid references public.zones (id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create trigger patrol_routes_set_updated_at
  before update on public.patrol_routes
  for each row execute function public.set_updated_at();

create table public.checkpoints (
  id          uuid primary key default gen_random_uuid(),
  route_id    uuid not null references public.patrol_routes (id) on delete cascade,
  name        text not null,
  seq         integer not null,          -- order within the route
  method      public.checkpoint_method not null default 'geofence',
  location    geography(Point, 4326),
  radius_m    numeric(8,2) default 25,
  tag_id      text,                       -- NFC/QR identifier
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (route_id, seq)
);

create index checkpoints_route_idx on public.checkpoints (route_id, seq);
create index checkpoints_loc_gix   on public.checkpoints using gist (location);

create trigger checkpoints_set_updated_at
  before update on public.checkpoints
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- patrol_sessions + checkpoint_scans
-- ----------------------------------------------------------------------------
create table public.patrol_sessions (
  id           uuid primary key default gen_random_uuid(),
  route_id     uuid not null references public.patrol_routes (id) on delete restrict,
  employee_id  uuid not null references public.profiles (id) on delete cascade,
  shift_id     uuid references public.shifts (id) on delete set null,
  status       public.patrol_status not null default 'in_progress',
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index patrol_sessions_emp_idx   on public.patrol_sessions (employee_id, started_at desc);
create index patrol_sessions_route_idx on public.patrol_sessions (route_id);

create trigger patrol_sessions_set_updated_at
  before update on public.patrol_sessions
  for each row execute function public.set_updated_at();

create table public.checkpoint_scans (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.patrol_sessions (id) on delete cascade,
  checkpoint_id uuid not null references public.checkpoints (id) on delete restrict,
  employee_id   uuid not null references public.profiles (id) on delete cascade,
  scanned_at    timestamptz not null default now(),
  location      geography(Point, 4326),
  method        public.checkpoint_method not null,
  in_geofence   boolean,                 -- server-verified proximity
  client_ref    uuid unique,             -- offline idempotency
  created_at    timestamptz not null default now()
);

create index checkpoint_scans_session_idx on public.checkpoint_scans (session_id, scanned_at);

comment on table public.attendance is 'Shift check-in/out, verified server-side.';
comment on table public.checkpoint_scans is 'Per-checkpoint scans during a patrol.';
