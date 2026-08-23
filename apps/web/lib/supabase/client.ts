'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@sentinel/shared';
import { env } from '@/lib/env';

/** Browser-side Supabase client (uses the anon key + cookie session). */
export function createClient() {
  return createBrowserClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}
