#!/usr/bin/env node
/**
 * Grant an app_role to a user by email. Uses the service_role key to look up the
 * auth user, ensure a profile row exists, and upsert into public.user_roles.
 *
 * Usage:
 *   node scripts/grant-role.mjs <email> <role>
 *   node scripts/grant-role.mjs you@company.com super_admin
 *
 * Valid roles: super_admin control_operator dispatcher supervisor guard patrol technician
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const env = readFileSync(join(__dirname, '..', '.env'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const VALID_ROLES = [
  'super_admin', 'control_operator', 'dispatcher', 'supervisor',
  'guard', 'patrol', 'technician',
];

const [email, role] = process.argv.slice(2);
if (!email || !role) {
  console.error('Usage: node scripts/grant-role.mjs <email> <role>');
  console.error('Roles:', VALID_ROLES.join(' '));
  process.exit(1);
}
if (!VALID_ROLES.includes(role)) {
  console.error(`Invalid role "${role}". Valid: ${VALID_ROLES.join(' ')}`);
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing from .env');
  process.exit(1);
}

const { createClient } = await import('@supabase/supabase-js');
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

// Find the auth user by email (paginate through the admin list).
let userId = null;
let userMeta = null;
for (let page = 1; page <= 50 && !userId; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) {
    console.error('Failed to list users:', error.message);
    process.exit(1);
  }
  const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (found) {
    userId = found.id;
    userMeta = found.user_metadata ?? {};
  }
  if (data.users.length < 200) break;
}

if (!userId) {
  console.error(
    `No auth user found for ${email}.\n` +
      'Create the user first: Supabase Dashboard -> Authentication -> Add user.'
  );
  process.exit(1);
}

// Ensure a profile row exists (the trigger normally creates it).
await admin.from('profiles').upsert(
  { id: userId, full_name: userMeta?.full_name ?? email },
  { onConflict: 'id', ignoreDuplicates: true }
);

const { error: roleErr } = await admin
  .from('user_roles')
  .upsert({ user_id: userId, role }, { onConflict: 'user_id,role' });

if (roleErr) {
  console.error('Failed to grant role:', roleErr.message);
  process.exit(1);
}

console.log(`Granted "${role}" to ${email} (${userId}).`);
