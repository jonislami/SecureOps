-- ============================================================================
-- 0107_site_source_url.sql
-- Store the pasted Google Maps link / coordinate text on the site, and let
-- admin_create_site accept it. Adding a defaulted param changes the signature,
-- so drop the old function first, then recreate.
-- ============================================================================

alter table public.sites add column if not exists source_url text;

drop function if exists public.admin_create_site(uuid, text, text, text, double precision, double precision, numeric);

create or replace function public.admin_create_site(
  p_client     uuid,
  p_name       text,
  p_code       text,
  p_address    text,
  p_lng        double precision,
  p_lat        double precision,
  p_radius_m   numeric default 100,
  p_source_url text default null
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

  insert into public.sites(client_id, name, code, address, location, source_url)
  values (
    p_client, p_name, nullif(p_code, ''), nullif(p_address, ''),
    ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography,
    nullif(p_source_url, '')
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

revoke all on function public.admin_create_site(uuid, text, text, text, double precision, double precision, numeric, text) from public;
grant execute on function public.admin_create_site(uuid, text, text, text, double precision, double precision, numeric, text) to authenticated;
