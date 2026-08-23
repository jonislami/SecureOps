-- ============================================================================
-- 0002_profiles_roles.sql
-- Identity: employee profiles (1:1 with auth.users) and role assignments.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
create type public.app_role as enum (
  'super_admin',
  'control_operator',
  'dispatcher',
  'supervisor',
  'guard',
  'patrol',
  'technician'
);

create type public.employment_type as enum (
  'guard',
  'patrol',
  'technician',
  'office'
);

create type public.employee_status as enum (
  'active',
  'suspended',
  'inactive'
);

-- ----------------------------------------------------------------------------
-- profiles: extends auth.users with employee data.
-- ----------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  full_name       text not null,
  employee_code   text unique,
  phone           text,
  employment_type public.employment_type not null default 'guard',
  status          public.employee_status not null default 'active',
  avatar_url      text,
  push_token      text,                 -- Expo/FCM push token (sensitive)
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

create index profiles_status_idx on public.profiles (status) where deleted_at is null;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

comment on table public.profiles is 'Employee records, 1:1 with auth.users.';

-- ----------------------------------------------------------------------------
-- user_roles: a user may hold multiple roles. Source of truth for RBAC.
-- ----------------------------------------------------------------------------
create table public.user_roles (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.app_role not null,
  granted_by uuid references public.profiles (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index user_roles_role_idx on public.user_roles (role);

comment on table public.user_roles is 'RBAC role assignments read by RLS helpers.';

-- ----------------------------------------------------------------------------
-- Auto-create a minimal profile when an auth user is created.
-- (Admin flows can enrich it afterward.)
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
