# Sentinel — Architecture Blueprint (Phase 0)

This directory is the **contract** everything else is built against. Read it in
order.

| # | Document | What it covers |
|---|---|---|
| 01 | [System Architecture](01-architecture.md) | Components, data flow, deployment topology |
| 02 | [Data Model](02-data-model.md) | Entities, relationships, the GPS storage strategy |
| 03 | [RBAC & RLS](03-rbac-rls.md) | Roles, permissions, Row-Level-Security design |
| 04 | [GPS Pipeline](04-gps-pipeline.md) | Ingest → geofence → live map → history/retention |
| 05 | [Repo Structure](05-repo-structure.md) | Monorepo layout & conventions |
| 06 | [Offline Sync](06-offline-sync.md) | Mobile offline-first queue & conflict handling |
| 07 | [Integration Boundary](07-integration-boundary.md) | Alarm-system & external integrations |

### Architecture Decision Records

Short, dated records of *why* — see [`adr/`](adr/).

| ADR | Decision |
|---|---|
| [0001](adr/0001-tech-stack.md) | Technology stack |
| [0002](adr/0002-single-tenant.md) | Single-tenant data model |
| [0003](adr/0003-gps-data-model.md) | Three-tier GPS storage (firehose / live / history) |
| [0004](adr/0004-rls-authorization.md) | Authorization in the database via RLS |
| [0005](adr/0005-monorepo.md) | pnpm + Turborepo monorepo |

## Locked Phase-0 decisions

- **Single tenant.** One security company. Its customers ("clients") and their
  sites are *data*, not tenants. No cross-tenant isolation required.
- **One role-adaptive mobile app** for guards, patrols, and technicians. No
  external client portal in scope.
- **GPS cadence 10–30 s**, ≤ 200 concurrent field staff. Pings are batched.
- **English-only UI**, but all strings routed through an i18n layer so languages
  can be added later with zero refactor.
