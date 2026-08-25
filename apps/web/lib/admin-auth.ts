import 'server-only';
import { getCurrentUser, type CurrentUser } from '@/lib/auth';

/**
 * Ensures the current session belongs to a super_admin. Throws otherwise.
 * Every admin server action and the admin page must call this before doing
 * anything privileged.
 */
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user || !user.roles.includes('super_admin')) {
    throw new Error('Forbidden: super admin only');
  }
  return user;
}
