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
  const raw = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!raw) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set — admin actions unavailable.');
  }
  // Trim stray whitespace/newlines that copy-paste often adds.
  const serviceKey = raw.trim();
  // A JWT is plain ASCII (base64url). Anything else means the pasted value is
  // corrupted (e.g. bullet characters from copying a masked field).
  if (!/^[A-Za-z0-9._-]+$/.test(serviceKey)) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY looks corrupted (contains invalid characters). ' +
        'Re-copy it from Supabase → Settings → API → service_role (click Reveal, then Copy) ' +
        'and paste it with no spaces or line breaks.'
    );
  }
  return createClient<Database>(env.SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
