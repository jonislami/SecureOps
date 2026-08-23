// Public API of @sentinel/shared — imported by web, mobile, and Edge Functions.

// Types
export type {
  Database,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
} from './types/db.types';

// Supabase client
export {
  createSentinelClient,
  type SentinelClient,
  type SupabaseClientConfig,
} from './supabase/client';

// Roles / RBAC constants
export {
  APP_ROLES,
  STAFF_ROLES,
  FIELD_ROLES,
  ROLE_LABELS,
  isStaffRole,
  isFieldRole,
  primarySurface,
  type AppRole,
} from './constants/roles';

// Zod schemas
export { signInSchema, type SignInInput } from './schemas/auth';
export {
  locationPingSchema,
  locationBatchSchema,
  type LocationPingInput,
  type LocationBatchInput,
} from './schemas/location';
