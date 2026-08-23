-- ============================================================================
-- 0100_rls_helpers.sql
-- SECURITY DEFINER helpers read by RLS policies (ADR-0004).
-- Marked STABLE with locked search_path to avoid recursive RLS + privilege
-- issues. These read user_roles directly rather than trusting JWT claims, so
-- role changes take effect immediately.
-- ============================================================================

-- Current authenticated user id (thin wrapper for readability).
create or replace function public.auth_uid()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

-- Does the current user hold the given role?
create or replace function public.has_role(p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = p_role
  );
$$;

-- Oversight roles: operators, dispatchers, supervisors, admins.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('super_admin', 'control_operator', 'dispatcher', 'supervisor')
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = 'super_admin'
  );
$$;

create or replace function public.is_dispatcher()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('super_admin', 'dispatcher')
  );
$$;

-- Does the current user supervise the target user (via teams)?
create or replace function public.supervises(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teams t
    join public.team_members tm on tm.team_id = t.id
    where t.supervisor_id = auth.uid()
      and tm.user_id = p_target
  );
$$;

-- Can the current user "oversee" the target employee's records?
-- (staff role OR direct supervisor OR the user themselves)
create or replace function public.can_oversee(p_target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() = p_target
    or public.is_staff()
    or public.supervises(p_target);
$$;

revoke all on function public.auth_uid()          from public;
revoke all on function public.has_role(public.app_role) from public;
revoke all on function public.is_staff()          from public;
revoke all on function public.is_admin()          from public;
revoke all on function public.is_dispatcher()     from public;
revoke all on function public.supervises(uuid)    from public;
revoke all on function public.can_oversee(uuid)   from public;

grant execute on function public.auth_uid()          to authenticated;
grant execute on function public.has_role(public.app_role) to authenticated;
grant execute on function public.is_staff()          to authenticated;
grant execute on function public.is_admin()          to authenticated;
grant execute on function public.is_dispatcher()     to authenticated;
grant execute on function public.supervises(uuid)    to authenticated;
grant execute on function public.can_oversee(uuid)   to authenticated;
