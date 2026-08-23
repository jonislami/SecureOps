# @sentinel/shared

The single source of truth for cross-surface code, imported by `apps/web`,
`apps/mobile`, and `supabase/functions`.

**Status:** placeholder (Phase 1 populates it).

Contents (planned):
- `src/types/` — domain types, incl. Supabase-generated `db.types.ts`
  (`pnpm db:types`)
- `src/schemas/` — Zod schemas validating every payload, used by BOTH client
  (forms) and server (Edge Functions). One definition, validated on both sides.
- `src/supabase/` — typed Supabase client factory
- `src/constants/` — roles, statuses, shared enums mirroring the DB

**Rule:** must stay runtime-agnostic — works in Node, browser, and Deno. No
Node-only or DOM-only APIs here (see [../../docs/adr/0005-monorepo.md](../../docs/adr/0005-monorepo.md)).
