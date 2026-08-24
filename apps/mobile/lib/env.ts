// Expo inlines EXPO_PUBLIC_* vars at build time.
export const env = {
  SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  MAPBOX_TOKEN: process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '',
};

if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
  console.warn(
    '[env] EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY not set. ' +
      'Create apps/mobile/.env from the template.'
  );
}
