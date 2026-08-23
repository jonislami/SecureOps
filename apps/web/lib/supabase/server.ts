import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@sentinel/shared';
import { env } from '@/lib/env';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

/**
 * Server-side Supabase client for Server Components, Route Handlers, and Server
 * Actions. Reads/writes the auth session via Next.js cookies.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // `setAll` called from a Server Component — safe to ignore when
          // middleware is refreshing the session.
        }
      },
    },
  });
}
