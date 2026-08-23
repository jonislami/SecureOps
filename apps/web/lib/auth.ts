import type { AppRole, Tables } from '@sentinel/shared';
import { createClient } from '@/lib/supabase/server';

export interface CurrentUser {
  id: string;
  email: string | null;
  profile: Tables<'profiles'> | null;
  roles: AppRole[];
}

/**
 * Loads the authenticated user together with their profile and roles.
 * Returns null when not signed in.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('user_roles').select('role').eq('user_id', user.id),
  ]);

  const roles = ((roleRows ?? []) as Array<{ role: AppRole }>).map((r) => r.role);

  return {
    id: user.id,
    email: user.email ?? null,
    profile: profile ?? null,
    roles,
  };
}
