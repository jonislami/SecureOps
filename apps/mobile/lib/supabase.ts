import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSentinelClient } from '@sentinel/shared';
import { env } from './env';

/**
 * Supabase client for React Native. Sessions persist via AsyncStorage.
 * `detectSessionInUrl` is disabled (no browser URL to parse on native).
 */
export const supabase = createSentinelClient({
  url: env.SUPABASE_URL,
  anonKey: env.SUPABASE_ANON_KEY,
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
