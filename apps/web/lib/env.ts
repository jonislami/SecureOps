/** Public env vars available in the browser + server. */
export const env = {
  SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  // Map: optional MapTiler key (free, no card). If absent we fall back to a
  // keyless free style (OpenFreeMap) so the map works with zero setup.
  MAPTILER_KEY: process.env.NEXT_PUBLIC_MAPTILER_KEY ?? '',
  MAP_STYLE_URL: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? '',
};

/** Keyless, free MapLibre style — no account required. */
const FREE_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Resolve the MapLibre style URL to use:
 *   1. explicit NEXT_PUBLIC_MAP_STYLE_URL if set,
 *   2. MapTiler streets if a key is provided,
 *   3. otherwise the keyless OpenFreeMap style.
 */
export function resolveMapStyle(): string {
  if (env.MAP_STYLE_URL) return env.MAP_STYLE_URL;
  if (env.MAPTILER_KEY) {
    return `https://api.maptiler.com/maps/streets-v2/style.json?key=${env.MAPTILER_KEY}`;
  }
  return FREE_STYLE;
}

if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
  // Surfaced at build/runtime so misconfiguration fails loudly, not silently.
  console.warn(
    '[env] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not set. ' +
      'Copy .env.example to .env.local and fill them in.'
  );
}
