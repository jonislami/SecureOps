-- ============================================================================
-- 0004_teams_vehicles_shifts.sql
-- Workforce structure (teams, vehicles) and scheduled shifts.
-- ============================================================================

create type public.shift_status as enum (
  'scheduled',
  'active',
  'completed',
  'missed',
  'cancelled'
);

create type public.vehicle_status as enum ('available', 'in_use', 'maintenance', 'retired');

-- ----------------------------------------------------------------------------
-- teams: a supervisor's team. Drives "supervisor sees their team" RLS.
-- ----------------------------------------------------------------------------
create table public.teams (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  supervisor_id uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index teams_supervisor_idx on public.teams (supervisor_id);

create trigger teams_set_updated_at
  before update on public.teams
  for each row execute function public.set_updated_at();

create table public.team_members (
  team_id   uuid not null references public.teams (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  added_at  timestamptz not null default now(),
  primary key (team_id, user_id)
);

create index team_members_user_idx on public.team_members (user_id);

-- ----------------------------------------------------------------------------
-- vehicles: patrol vehicles.
-- ----------------------------------------------------------------------------
create table public.vehicles (
  id           uuid primary key default gen_random_uuid(),
  plate        text unique not null,
  label        text,
  type         text,
  status       public.vehicle_status not null default 'available',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- shifts: scheduled work. Target is a site (static guard) OR a zone (patrol).
-- The active shift is the context that authorizes on-site GPS + attendance.
-- ----------------------------------------------------------------------------
create table public.shifts (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.profiles (id) on delete cascade,
  site_id      uuid references public.sites (id) on delete set null,
  zone_id      uuid references public.zones (id) on delete set null,
  vehicle_id   uuid references public.vehicles (id) on delete set null,
  status       public.shift_status not null default 'scheduled',
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  started_at   timestamptz,            -- actual clock-in
  ended_at     timestamptz,            -- actual clock-out
  notes        text,
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint shift_has_target check (site_id is not null or zone_id is not null),
  constraint shift_time_valid check (ends_at > starts_at)
);

create index shifts_employee_idx on public.shifts (employee_id, starts_at desc);
create index shifts_site_idx     on public.shifts (site_id);
create index shifts_status_idx   on public.shifts (status);
-- Fast lookup of the currently-active shift for a given employee.
create index shifts_active_idx on public.shifts (employee_id)
  where status = 'active';

create trigger shifts_set_updated_at
  before update on public.shifts
  for each row execute function public.set_updated_at();

comment on table public.shifts is
  'Scheduled + actual work windows. Active shift authorizes GPS & attendance.';
