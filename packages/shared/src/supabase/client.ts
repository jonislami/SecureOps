import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/db.types';

export type SentinelClient = SupabaseClient<Database>;

export interface SupabaseClientConfig {
  url: string;
  anonKey: string;
  /** Optional overrides (e.g. custom storage for React Native). */
  auth?: {
    storage?: unknown;
    persistSession?: boolean;
    autoRefreshToken?: boolean;
    detectSessionInUrl?: boolean;
  };
}

/**
 * Create a typed Supabase client. Runtime-agnostic: works in the browser,
 * Node/Next server, and React Native (pass a storage adapter via `auth`).
 */
export function createSentinelClient(config: SupabaseClientConfig): SentinelClient {
  return createClient<Database>(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      ...(config.auth ?? {}),
    },
  } as never);
}
