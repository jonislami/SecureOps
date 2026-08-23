# apps/web — Control Center

Next.js + TypeScript + Tailwind + shadcn/ui web app for control-center operators.

**Status:** placeholder (Phase 1 scaffolds the running app).

Responsibilities:
- Live map of all active field staff (Mapbox + Supabase Realtime on `current_location`)
- Staff / shift / attendance management
- Dispatch & tasks
- Emergencies / incidents console
- Reporting & audit views

Imports domain types + Zod schemas from `@sentinel/shared`. Auth via Supabase;
all data access is RLS-scoped (see [../../docs/03-rbac-rls.md](../../docs/03-rbac-rls.md)).
