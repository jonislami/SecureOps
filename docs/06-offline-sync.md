# 06 — Offline-First Sync (Mobile)

Field staff work in basements, rural sites, and dead zones. The app must remain
useful with no connectivity and reconcile cleanly on reconnect.

## 1. What must work offline

| Capability | Offline behavior |
|---|---|
| GPS pings | Queued locally, flushed in batches on reconnect |
| Attendance check-in/out | Recorded locally with timestamp + location; synced later |
| Patrol checkpoint scans | Recorded locally; synced later |
| Task status updates | Queued; synced later |
| Viewing assigned shift/site/task | Cached last-known data |
| SOS | Best-effort immediate send; queued + retried aggressively if offline |

## 2. Local store

- **Durable queue** in SQLite (or MMKV for small payloads) — survives app kill
  and reboot.
- Each queued mutation carries: a **client-generated UUID** (idempotency key),
  `recorded_at` (device time), payload, and retry metadata.
- A background sync task flushes the queue when connectivity returns
  (`expo-network` + `expo-task-manager`).

## 3. Sync protocol

1. Client sends batched mutations, each with its idempotency key.
2. Server (Edge Function / PostgREST upsert) is **idempotent**: re-applying the
   same key is a no-op, so retries after a flaky connection never duplicate.
3. Server orders time-sensitive records by device `recorded_at`, but also stores
   `received_at` and flags large clock skew.
4. Server returns per-item ack; client removes acked items from the queue.

## 4. Conflict resolution

- **GPS / scans / attendance**: append-only facts — no conflicts, just ordering.
- **Task status**: last-write-wins by server receipt, but transitions are
  validated (can't move a `completed` task back to `open` from a stale device);
  rejected transitions surface to the user.
- **Reference data** (shifts, sites, tasks assigned *to* the user): server is
  authoritative; client cache is read-only and refreshed on reconnect.

## 5. UX rules

- Always show sync state: a subtle "N pending / syncing / all synced" indicator.
- Never block a safety action (SOS, check-in) on connectivity.
- Make it obvious when displayed data is cached/stale.

## 6. Clock trust

Device clocks drift and can be wrong. `recorded_at` is used for ordering and
display, but geofence/shift *authorization* decisions use server evaluation at
ingest, not the device's self-reported time — see
[04-gps-pipeline.md](04-gps-pipeline.md).
