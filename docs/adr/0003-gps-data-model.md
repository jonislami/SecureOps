# ADR-0003 — Three-Tier GPS Storage

- **Status:** Accepted
- **Date:** 2026-08-23

## Context

Up to 200 field staff emit a location every 10–30 s while on shift
(~13 writes/s sustained, millions of rows/month). The control-center map must
stay smooth for multiple operators, history must be retrievable, and storage
cost must stay bounded. A single "locations" table used for both live map and
history does not scale on any of those axes.

## Decision

Separate location data into **three tiers**:

1. **`location_pings`** — append-only raw firehose, **partitioned by month**.
   Never queried by the live map.
2. **`current_location`** — exactly **one row per employee**, upserted on each
   ingest. The *only* source for the live map / Realtime.
3. **`location_history`** — downsampled rollup (≈1 pt / 5 min) of aged
   partitions, for long-term playback/reporting.

## Rationale

- The live map subscribes to a **tiny, bounded** table → cheap Realtime, fast
  renders.
- Writes hit an append-only partitioned table → predictable performance and easy
  retention (drop old partitions).
- History cost is bounded by downsampling.

## Consequences

- Ingest must write two tables (insert ping + upsert current) — done atomically
  in the ingest Edge Function.
- Partition management (create-ahead, roll-up, drop) is a scheduled job to build
  in Phase 2.
- Slightly more moving parts than one table, justified by scale requirements.

See [../04-gps-pipeline.md](../04-gps-pipeline.md) for the full pipeline.
