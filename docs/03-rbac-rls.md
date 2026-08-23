# 03 — RBAC & Row-Level Security

**Principle:** authorization lives in the database. Every table that holds
sensitive data has RLS enabled and explicit policies. The app layer is a
convenience, not a security boundary — a bug in the web or mobile client can
never grant access the database itself denies. See
[ADR-0004](adr/0004-rls-authorization.md).

## 1. Roles

| Role | Scope | Can |
|---|---|---|
| `super_admin` | Global | Everything, including config & user management |
| `control_operator` | Global (read-heavy) | Live map of all field staff, all events/incidents, dispatch reads |
| `dispatcher` | Global (tasks/comms) | Create/assign tasks, message field staff, manage patrol/shift dispatch |
| `supervisor` | Their team + assigned sites | See & manage their team's shifts, attendance, tasks, locations |
| `guard` | Self | Own shifts, own attendance, own GPS, assigned site info, own tasks/messages |
| `patrol` | Self | Own shifts, own patrol sessions/checkpoints, own GPS, own tasks/messages |
| `technician` | Self | Own tasks/jobs, own GPS while on shift, own messages |

A user may hold multiple roles (e.g. a supervisor who is also a guard). Effective
permission is the **union**.

## 2. How roles reach the database

Roles live in `user_roles`. Rather than trusting a JWT claim that could go stale,
RLS policies call **`SECURITY DEFINER` helper functions** that read `user_roles`
for `auth.uid()`. This keeps role changes effective immediately and keeps policy
expressions readable.

Helper functions (defined in
[`supabase/migrations/0100_rls_helpers.sql`](../supabase/migrations/0100_rls_helpers.sql)):

```sql
auth_uid()                    -- current user id (auth.uid())
has_role(role app_role)       -- does current user hold this role?
is_staff()                    -- control_operator OR dispatcher OR supervisor OR super_admin
is_admin()                    -- super_admin
supervises(target_user uuid)  -- current user is target's supervisor (via teams)
```

> Helpers are `SECURITY DEFINER` and marked `STABLE`, with a locked `search_path`,
> to avoid recursive RLS evaluation and privilege pitfalls.

## 3. Policy pattern per domain

### 3.1 Self-owned rows (GPS, attendance, own tasks)
```
SELECT/INSERT/UPDATE allowed when  employee_id = auth_uid()
                       OR  is_staff()            -- operators/dispatchers/admin
                       OR  supervises(employee_id)
```
Field staff touch only their own rows; oversight roles see across.

### 3.2 Reference data (sites, clients, zones, geofences)
```
SELECT: any authenticated staff; guards see sites they are assigned to (via shifts)
WRITE : is_admin() (and dispatcher for operational fields where applicable)
```

### 3.3 Tasks
```
SELECT: assignee, creator, is_staff(), or supervisor of assignee
INSERT: dispatcher / supervisor / admin
UPDATE: assignee may advance status of own task; staff may reassign
```

### 3.4 Incidents (SOS)
```
INSERT: any authenticated user (a guard must always be able to raise SOS)
SELECT/UPDATE (acknowledge/resolve): is_staff()
```
SOS is intentionally the most permissive insert in the system — safety first.

### 3.5 Audit log
```
SELECT: is_admin() (and supervisor for their team's entities — Phase 8)
INSERT: service role / SECURITY DEFINER triggers only
UPDATE/DELETE: nobody (append-only)
```

## 4. Write-path authority

Some rules cannot be expressed as a simple row predicate — e.g. "a guard may only
check in when physically inside the site geofence during an active shift." These
are enforced **server-side in Edge Functions** (holding `service_role`) which
validate then write. RLS remains the backstop for direct table access; Edge
Functions add the situational business rules. GPS ingest and attendance
verification both work this way (see [04](04-gps-pipeline.md)).

## 5. Storage (files)

Supabase Storage buckets (`evidence`, `avatars`) get their own policies mirroring
the same helpers: staff read all; field staff read/write only paths under their
own `auth.uid()`.

## 6. Testing RLS

RLS policies are tested as data: a `pgTAP`/SQL test suite (Phase 1) asserts, per
role, that permitted reads/writes succeed and forbidden ones fail. **No RLS
change ships without a test.**

## 7. Least privilege elsewhere

- `anon` role: no table access beyond what auth needs.
- `authenticated`: only via RLS policies above.
- `service_role`: Edge Functions / server only — never in a client bundle.
- Push tokens, phone numbers, and precise locations are treated as sensitive PII
  and never exposed to roles without a need to know.
