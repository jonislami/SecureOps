-- ============================================================================
-- 0001_extensions.sql
-- Extensions + shared utilities used across the schema.
-- ============================================================================

-- PostGIS for geography/geometry, geofencing, spatial indexes.
create extension if not exists postgis;

-- gen_random_uuid(), crypto helpers.
create extension if not exists pgcrypto;

-- Scheduled jobs (partition management, rollups). Available on Supabase.
-- (Safe to skip locally if unavailable; guarded so migrations don't fail.)
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron not available in this environment; skipping.';
end $$;

-- ----------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh on mutable tables.
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Trigger fn: sets updated_at = now() on UPDATE.';
