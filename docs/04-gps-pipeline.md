# 04 — GPS Pipeline

The highest-risk subsystem. This spec is the reference implementation for Phase 2.

## 1. Requirements (locked)

- Cadence **10–30 s** per active field member; **≤ 200 concurrent**.
- Live map must stay smooth for multiple operators.
- Server is authoritative for geofencing and spoof detection.
- Works through connectivity gaps (offline queue on device).
- History retrievable for playback; storage cost bounded.

Load math: 200 × (1 ping / 15 s) ≈ **13.3 writes/s** average sustained. With
batching (device sends 4–6 pings per request) that is ~2–3 req/s to the ingest
function. Comfortable for Supabase Postgres on the Pro plan.

## 2. Three-tier storage

```
                 ┌─────────────────────────┐
  device batch → │ Edge Fn: ingest-locations│
                 └───────────┬─────────────┘
        ┌────────────────────┼─────────────────────────┐
        ▼                    ▼                          ▼
 location_pings        current_location          geofence eval (PostGIS)
 (append-only,         (1 row/employee,           → geofence_events
  partitioned/month)    upserted)                 → incidents/alerts
        │                    │
        │ (age > 90d)        └── Realtime broadcast → control-center live map
        ▼
 location_history
 (downsampled 1pt/5min)
```

- **`location_pings`** — `PARTITION BY RANGE (recorded_at)`, one partition per
  month, GiST index on `location`, btree on `(employee_id, recorded_at)`. Never
  read by the live map.
- **`current_location`** — PK = `employee_id`; every ingest `UPSERT`s it. This
  and only this feeds the map.
- **`location_history`** — rollup target for aged partitions.

## 3. Device side

- **Background location** via `expo-location` (`startLocationUpdatesAsync`) +
  `expo-task-manager`. Cadence adapts: tighter when moving/on-shift, relaxed when
  stationary/off-shift (battery).
- **Batching & queue**: pings written to a local durable store (SQLite/MMKV) and
  flushed in batches; unsent pings survive app kills and offline periods (see
  [06-offline-sync.md](06-offline-sync.md)).
- **Metadata per ping**: `recorded_at`, lat/lng, `accuracy`, `speed`, `heading`,
  `battery`, `is_moving`, and `is_mock` (Android mock-location flag) for spoof
  signals.
- **Only sent while a shift is active** (or SOS). No off-shift tracking — a
  privacy and trust requirement.

## 4. Ingest Edge Function (`ingest-locations`)

Runs with `service_role`. Per request:

1. **AuthN/Z**: verify JWT; confirm the caller owns the pings and has an active
   shift (or an open SOS).
2. **Validate**: drop implausible points (accuracy too low, impossible speed,
   `is_mock` → flag not silently drop).
3. **Insert** batch into `location_pings`.
4. **Upsert** the latest point into `current_location`.
5. **Geofence eval** (PostGIS): compare latest point against relevant geofences
   (`ST_Covers` for polygons, `ST_DWithin` for circles). Emit `geofence_events`
   on transitions; raise alerts for unexpected exits (e.g. guard left post).
6. **Return** minimal ack (accepted count, server time for clock-skew handling).

Why server-side: a device can lie about geofence status, shift validity, and its
own clock. Centralizing this makes the audit trail trustworthy.

## 5. Live map (control center)

- Subscribes to `current_location` changes via Supabase Realtime.
- Renders with Mapbox; **marker clustering** + viewport culling keep 200 movers
  smooth.
- Staleness shading: a marker not updated within N intervals is shown as
  "stale/offline".
- Trails/playback query `location_pings` (recent) or `location_history` (old),
  downsampled server-side.

## 6. Geofencing model

- **On-device** coarse geofencing (`expo-location` regions) gives instant,
  offline-capable enter/exit UX and can trigger local reminders.
- **Server-side** PostGIS evaluation on ingest is **authoritative** — it is what
  writes `geofence_events`, fires alerts, and appears in reports/audit.
- Discrepancies (device says "inside", server says "outside") are themselves a
  signal worth logging.

## 7. Retention & cost control

- Monthly partitions; a scheduled job (pg_cron / Edge Function) creates next
  month's partition ahead of time.
- Partitions older than **90 days** → rolled up into `location_history`
  (1 pt / 5 min) then dropped. Threshold configurable per contract/law.
- `current_location` never grows (bounded at #employees).

## 8. Failure modes handled

| Failure | Handling |
|---|---|
| Device offline | Local queue; flush on reconnect; server orders by `recorded_at` |
| Duplicate batch (retry) | Idempotency key per ping (`employee_id`+`recorded_at`) upsert-safe |
| Clock skew | Server records `received_at`; uses `recorded_at` for ordering, flags large skew |
| GPS spoofing | `is_mock` + speed/teleport heuristics → flag + `geofence_event`/incident |
| Realtime overload | Map subscribes to `current_location` only (bounded), not the firehose |
