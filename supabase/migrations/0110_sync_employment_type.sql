-- ============================================================================
-- 0110_sync_employment_type.sql
-- Keep profiles.employment_type in sync with the user's roles. Previously the
-- admin panel set roles but never employment_type, so everyone stayed 'guard' —
-- which broke the patrol/guard map filter and made the Respond console find no
-- patrols. A trigger on user_roles recomputes it for any role change (admin
-- panel, grant-role script, or direct), and we backfill existing users.
-- Priority: patrol > technician > guard > (office for oversight-only).
-- ============================================================================

create or replace function public.employment_type_for(p_user uuid)
returns public.employment_type
language sql stable security definer set search_path = public
as $$
  select case
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'patrol') then 'patrol'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'technician') then 'technician'
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'guard') then 'guard'
    when exists (select 1 from public.user_roles where user_id = p_user
                 and role in ('super_admin','control_operator','dispatcher','supervisor')) then 'office'
    else 'guard'
  end::public.employment_type;
$$;

create or replace function public.sync_employment_type()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_user uuid := coalesce(new.user_id, old.user_id);
begin
  update public.profiles set employment_type = public.employment_type_for(v_user) where id = v_user;
  return null;
end $$;

drop trigger if exists user_roles_sync_emptype on public.user_roles;
create trigger user_roles_sync_emptype
  after insert or update or delete on public.user_roles
  for each row execute function public.sync_employment_type();

-- Backfill everyone from their current roles.
update public.profiles p
set employment_type = public.employment_type_for(p.id)
where exists (select 1 from public.user_roles ur where ur.user_id = p.id);
