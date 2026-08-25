import 'server-only';
import type { AppRole } from '@sentinel/shared';
import { requireSuperAdmin } from '@/lib/admin-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export interface Worker {
  id: string;
  email: string | null;
  full_name: string;
  phone: string | null;
  employee_code: string | null;
  status: string;
  roles: AppRole[];
  banned: boolean;
  last_seen: string | null;
}

/** Full worker directory: auth users merged with profile, roles, last GPS. */
export async function listWorkers(): Promise<Worker[]> {
  await requireSuperAdmin();
  const admin = createAdminClient();

  const users: Array<{ id: string; email?: string; banned_until?: string | null }> = [];
  for (let page = 1; page <= 25; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    users.push(...(data.users as typeof users));
    if (data.users.length < 200) break;
  }
  const ids = users.map((u) => u.id);
  if (ids.length === 0) return [];

  const [profRes, roleRes, locRes] = await Promise.all([
    admin.from('profiles').select('id, full_name, phone, employee_code, status').in('id', ids),
    admin.from('user_roles').select('user_id, role').in('user_id', ids),
    admin.from('current_location').select('employee_id, updated_at').in('employee_id', ids),
  ]);

  const profiles = (profRes.data ?? []) as Array<{
    id: string;
    full_name: string | null;
    phone: string | null;
    employee_code: string | null;
    status: string;
  }>;
  const roles = (roleRes.data ?? []) as Array<{ user_id: string; role: string }>;
  const locs = (locRes.data ?? []) as Array<{ employee_id: string; updated_at: string }>;

  const pmap = new Map(profiles.map((p) => [p.id, p]));
  const rmap = new Map<string, AppRole[]>();
  for (const r of roles) {
    const arr = rmap.get(r.user_id) ?? [];
    arr.push(r.role as AppRole);
    rmap.set(r.user_id, arr);
  }
  const lmap = new Map(locs.map((l) => [l.employee_id, l.updated_at]));

  return users
    .map((u) => {
      const p = pmap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        full_name: p?.full_name ?? u.email ?? '—',
        phone: p?.phone ?? null,
        employee_code: p?.employee_code ?? null,
        status: p?.status ?? 'active',
        roles: rmap.get(u.id) ?? [],
        banned: !!u.banned_until && new Date(u.banned_until) > new Date(),
        last_seen: lmap.get(u.id) ?? null,
      };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
}
