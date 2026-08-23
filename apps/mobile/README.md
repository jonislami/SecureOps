# apps/mobile — Field App

Expo + React Native + TypeScript app for field staff (guards, patrols,
technicians) with a **role-adaptive** UI — one app, different capabilities per
role.

**Status:** placeholder (Phase 1 scaffolds the running app).

Responsibilities:
- Background GPS with offline queue (see [../../docs/04-gps-pipeline.md](../../docs/04-gps-pipeline.md), [../../docs/06-offline-sync.md](../../docs/06-offline-sync.md))
- Shift start/stop + attendance check-in/out (geofence-gated)
- Patrol sessions + checkpoint scans (NFC/QR/geofence)
- Tasks assigned to the user
- Messaging with the control center
- **SOS / panic** — always available, even offline

Imports domain types + Zod schemas from `@sentinel/shared`. English-only UI via
`i18next`, structured so more languages drop in later.
