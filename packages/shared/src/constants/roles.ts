import type { Enums } from '../types/db.types';

/** App roles — mirrors the Postgres `app_role` enum. */
export type AppRole = Enums<'app_role'>;

export const APP_ROLES: readonly AppRole[] = [
  'super_admin',
  'control_operator',
  'dispatcher',
  'supervisor',
  'guard',
  'patrol',
  'technician',
] as const;

/** Roles with cross-org oversight (map, all staff, dispatch). */
export const STAFF_ROLES: readonly AppRole[] = [
  'super_admin',
  'control_operator',
  'dispatcher',
  'supervisor',
] as const;

/** Roles that operate in the field via the mobile app. */
export const FIELD_ROLES: readonly AppRole[] = ['guard', 'patrol', 'technician'] as const;

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  control_operator: 'Control Operator',
  dispatcher: 'Dispatcher',
  supervisor: 'Supervisor',
  guard: 'Guard',
  patrol: 'Patrol Officer',
  technician: 'Technician',
};

export const isStaffRole = (r: AppRole): boolean => STAFF_ROLES.includes(r);
export const isFieldRole = (r: AppRole): boolean => FIELD_ROLES.includes(r);

/** Which surface a user's roles grant access to. */
export function primarySurface(roles: AppRole[]): 'web' | 'mobile' | 'both' | 'none' {
  const staff = roles.some(isStaffRole);
  const field = roles.some(isFieldRole);
  if (staff && field) return 'both';
  if (staff) return 'web';
  if (field) return 'mobile';
  return 'none';
}
