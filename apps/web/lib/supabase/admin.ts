import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@sentinel/shared';
import { env } from '@/lib/env';

/**
 * SERVER-ONLY Supabase client using the service_role key. Bypasses RLS, so it
 * must never be imported into client code (the `server-only` import enforces
 * this at build time) and every caller must first verify the requester is a
 * super_admin (see requireSuperAdmin).
 */
export function createAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — admin actions unavailable.');
  }
  return createClient<Database>(env.SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
