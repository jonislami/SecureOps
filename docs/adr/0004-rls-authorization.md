# ADR-0004 — Authorization in the Database via RLS

- **Status:** Accepted
- **Date:** 2026-08-23

## Context

The data is sensitive (GPS, PII, sites, emergencies). Clients (web + mobile) talk
to Postgres through PostgREST/Supabase, so a client bug or a compromised token
must not be able to read or write data the user isn't entitled to.

## Decision

Enforce authorization with **Postgres Row-Level Security** as the single source
of truth. Every sensitive table has RLS enabled and explicit policies, driven by
`SECURITY DEFINER` helper functions (`has_role`, `is_staff`, `supervises`, …)
that read `user_roles`. Business rules that a row predicate can't express (e.g.
"check in only inside the geofence during an active shift") are enforced in Edge
Functions holding `service_role`, with RLS as the backstop.

## Rationale

- Security does not depend on every client code path being correct.
- Roles change take effect immediately (policies read `user_roles`, not a cached
  JWT claim).
- Keeps authorization close to the data and uniformly applied across web, mobile,
  and any future client.

## Consequences

- Policies must be written and **tested** (pgTAP) for every table — more upfront
  work, offset by correctness and auditability.
- Helper functions must be `STABLE`, `SECURITY DEFINER`, with locked
  `search_path` to avoid recursion and privilege issues.
- Some flows require an Edge Function rather than a direct table write; accepted.

See [../03-rbac-rls.md](../03-rbac-rls.md).
