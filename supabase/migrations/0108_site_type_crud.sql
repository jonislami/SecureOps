-- ============================================================================
-- 0108_site_type_crud.sql
-- Building type on sites, plus admin edit/delete. admin_create_site gains a
-- type param (signature change -> drop/recreate).
-- ============================================================================

do $$ begin
  create type public.site_type as enum ('home', 'office', 'warehouse', 'retail', 'industrial', 'bank', 'other');
exception when duplicate_object then null; end $$;

alter table public.sites add column if not exists site_type public.site_type not null default 'other';

-- ---- create (now with p_type) ----
drop function if exists public.admin_create_site(uuid, text, text, text, double precision, double precision, numeric, text);

create or replace function public.admin_create_site(
  p_client uuid, p_name text, p_code text, p_address text,
  p_lng double precision, p_lat double precision,
  p_radius_m numeric default 100, p_source_url text default null, p_type text default 'other'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_site uuid;
begin
  if not public.is_admin() then raise exception 'forbidden: admin only'; end if;
  if p_client is null or p_name is null or p_lng is null or p_lat is null then
    raise exception 'client, name, lng and lat are required';
  end if;
  insert into public.sites(client_id, name, code, address, location, source_url, site_type)
  values (p_client, p_name, nullif(p_code, ''), nullif(p_address, ''),
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
          nullif(p_source_url, ''), coalesce(p_type, 'other')::public.site_type)
  returning id into v_site;
  insert into public.geofences(site_id, name, shape, center, radius_m)
  values (v_site, p_name || ' perimeter', 'circle',
          ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography, coalesce(p_radius_m, 100));
  return jsonb_build_object('site_id', v_site);
end $$;

revoke all on function public.admin_create_site(uuid, text, text, text, double precision, double precision, numeric, text, text) from public;
grant execute on function public.admin_create_site(uuid, text, text, text, double precision, double precision, numeric, text, text) to authenticated;

-- ---- update ----
create or replace function public.admin_update_site(
  p_id uuid, p_name text, p_type text, p_address text,
  p_lng double precision, p_lat double precision, p_radius_m numeric
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden: admin only'; end if;
  update public.sites set
    name = coalesce(p_name, name),
    site_type = coalesce(p_type, site_type::text)::public.site_type,
    address = nullif(p_address, ''),
    location = case when p_lng is not null and p_lat is not null
                    then ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography else location end
  where id = p_id;
  -- keep the site's circular geofence in sync
  update public.geofences set
    center = case when p_lng is not null and p_lat is not null
                  then ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography else center end,
    radius_m = coalesce(p_radius_m, radius_m)
  where site_id = p_id and shape = 'circle';
end $$;

revoke all on function public.admin_update_site(uuid, text, text, text, double precision, double precision, numeric) from public;
grant execute on function public.admin_update_site(uuid, text, text, text, double precision, double precision, numeric) to authenticated;

-- ---- delete ----
create or replace function public.admin_delete_site(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'forbidden: admin only'; end if;
  delete from public.sites where id = p_id;  -- geofences cascade
end $$;

revoke all on function public.admin_delete_site(uuid) from public;
grant execute on function public.admin_delete_site(uuid) to authenticated;
