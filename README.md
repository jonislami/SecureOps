# Sentinel — Security Operations Platform

An enterprise-grade **workforce operations platform** for a professional security
company. It gives the control center a real-time operational view of all field
employees — **static guards, mobile patrols, and technicians** — and manages
shifts, attendance, geofencing, patrols, tasks/dispatch, communication,
emergency response, reporting, and auditability.

> **System boundary.** This platform is the *operational workforce layer*. The
> existing alarm-monitoring system remains responsible for alarm reception and
> monitoring. Integration happens later via APIs/events, loosely coupled — see
> [`docs/07-integration-boundary.md`](docs/07-integration-boundary.md).

## Status

**Phase 0 — Architecture.** This repository currently contains the architecture
blueprint (docs), the database schema and RLS design (SQL migrations), and the
monorepo skeleton. Application code is added in later phases.

See the [phased roadmap](#roadmap) below and the docs in [`docs/`](docs/).

## Tech stack

| Layer | Choice |
|---|---|
| Mobile | React Native, Expo, TypeScript |
| Web (control center) | Next.js, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | Supabase — Postgres, PostGIS, Auth, Realtime, Storage, Edge Functions |
| Maps | Mapbox |
| Notifications | Expo Notifications + Firebase Cloud Messaging |
| Monitoring | Sentry, OpenTelemetry-compatible |
| CI/CD | GitHub Actions |
| Hosting | Vercel (web), Supabase (backend) |

Full rationale in [`docs/adr/0001-tech-stack.md`](docs/adr/0001-tech-stack.md).

## Repository layout

```
apps/
  web/        Next.js control-center web app          (Phase 1+)
  mobile/     Expo field app (role-adaptive)          (Phase 1+)
packages/
  shared/     Shared TS types, Zod schemas, clients   (Phase 1+)
supabase/
  migrations/ Postgres/PostGIS schema + RLS policies  (Phase 0)
  functions/  Edge Functions                          (Phase 2+)
docs/         Architecture blueprint & ADRs           (Phase 0)
.github/      CI/CD workflows
```

Details in [`docs/05-repo-structure.md`](docs/05-repo-structure.md).

## Roadmap

| Phase | Name | Focus |
|---|---|---|
| 0 | Architecture | System design, data model, RBAC/RLS, repo skeleton |
| 1 | Foundation | Auth, roles, monorepo apps running end-to-end |
| 2 | GPS Foundation | Live location: device → ingest → control-center map |
| 3 | Static Guards | Shifts, attendance, site geofencing |
| 4 | Patrols | Routes, checkpoints, patrol sessions |
| 5 | Technicians | Task-based field work |
| 6 | Communication | Messaging between control center & field |
| 7 | Tasks / Dispatch | Work assignment & dispatch workflow |
| 8 | Advanced Operations | Emergencies, reporting, analytics |
| 9 | External Integrations | Alarm system events/APIs |

## Getting started (developers)

Prerequisites are installed as the apps come online in Phase 1. For now, the
database schema can be reviewed under [`supabase/migrations/`](supabase/migrations/)
and applied to a local Supabase instance with the Supabase CLI.

## Security & privacy

Least privilege, RBAC, Postgres Row Level Security, server-side authorization,
and audit logging are foundational — see
[`docs/03-rbac-rls.md`](docs/03-rbac-rls.md). GPS, employee, site, operational,
communication, and emergency data are all treated as sensitive.
