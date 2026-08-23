/** Public env vars available in the browser + server. */
export const env = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  MAPBOX_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '',
};

if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
  // Surfaced at build/runtime so misconfiguration fails loudly, not silently.
  console.warn(
    '[env] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. ' +
      'Copy .env.example to .env.local and fill them in.'
  );
}
