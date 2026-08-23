# Edge Functions

Deno-runtime server-side functions. Built starting in Phase 2.

Planned functions:

| Function | Phase | Purpose |
|---|---|---|
| `ingest-locations` | 2 | Validate + store GPS batches, upsert `current_location`, evaluate geofences (see [../../docs/04-gps-pipeline.md](../../docs/04-gps-pipeline.md)) |
| `verify-attendance` | 3 | Geofence-gated check-in/out verification |
| `dispatch-task` | 7 | Assign a task + notify the assignee |
| `send-push` | 2+ | Fan out Expo/FCM push notifications |
| `partitions-maintain` | 2 | Create next month's `location_pings` partition; roll up + drop old ones |
| `integrations/alarm-inbound` | 9 | Receive alarm-system webhooks into the event inbox |

These run with the `service_role` key and are the only place situational
business rules (that RLS can't express) are enforced. Never ship the
`service_role` key to a client bundle.
