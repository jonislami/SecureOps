# ADR-0001 — Technology Stack

- **Status:** Accepted
- **Date:** 2026-08-23

## Context

We are building an enterprise security operations platform with a web control
center, an offline-capable mobile field app, high-frequency GPS, realtime
mapping, and strong authorization/audit requirements — see the project brief.

## Decision

Adopt the stack mandated by the project brief:

- **Mobile:** React Native + Expo + TypeScript
- **Web:** Next.js + TypeScript + Tailwind CSS + shadcn/ui
- **Backend:** Supabase (Postgres, PostGIS, Auth, Realtime, Storage, Edge
  Functions)
- **Maps:** Mapbox
- **Notifications:** Expo Notifications + Firebase Cloud Messaging
- **Monitoring:** Sentry, OpenTelemetry-compatible
- **CI/CD:** GitHub Actions; **Hosting:** Vercel + Supabase

## Rationale

- Supabase gives us Postgres (with **PostGIS** for geofencing), **RLS** for
  database-enforced authorization, **Realtime** for the live map, Auth, Storage,
  and Edge Functions — covering nearly every backend need with one managed
  platform and minimal ops.
- Expo + Next.js + shared TypeScript enable a monorepo with shared domain types
  and validation.
- All choices are mature, well-documented, and integrate cleanly.

## Consequences

- We depend on Supabase's managed limits; we plan for the **Pro** plan before
  real GPS load (Realtime connections, DB resources).
- Edge Functions run on Deno (separate runtime from the Node/Next apps) — shared
  code must stay runtime-agnostic.
- Mapbox and FCM require their own accounts/keys and have their own quotas.
