# ADR-0005 — pnpm + Turborepo Monorepo

- **Status:** Accepted
- **Date:** 2026-08-23

## Context

Web (Next.js), mobile (Expo), and Edge Functions all model the same domain and
must share types and validation. Keeping them in separate repos invites drift:
three definitions of a "task" or a "location ping" that slowly diverge.

## Decision

Use a **single monorepo** managed with **pnpm workspaces** + **Turborepo**.
Shared domain types, Zod schemas, and the typed Supabase client live in
`packages/shared`, imported by every surface. Supabase migrations and Edge
Functions live in `supabase/` at the repo root.

## Rationale

- One source of truth for domain types → no drift between web, mobile, DB.
- Atomic changes across surfaces in a single PR/commit.
- Turborepo caches lint/typecheck/test/build across packages for fast CI.
- pnpm is disk-efficient and strict about phantom dependencies.

## Consequences

- `packages/shared` must stay **runtime-agnostic** (works in Node, browser, and
  Deno Edge Functions) — no Node-only or DOM-only APIs in shared code.
- Slightly more tooling setup (workspace config, path aliases) up front.
- Mobile (Expo/Metro) needs monorepo-aware bundler config — handled in Phase 1.
