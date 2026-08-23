# ADR-0002 — Single-Tenant Data Model

- **Status:** Accepted
- **Date:** 2026-08-23

## Context

The platform serves **one** professional security company. That company protects
many customer sites. A question at the start of a multi-tenant-looking domain is
whether customers ("clients") are *tenants* (isolated) or *data*.

Decision input: no external client portal is in scope; only the company's own
staff use the system.

## Decision

Model the system as **single-tenant**. The security company is the tenant.
`clients` and their `sites` are ordinary data rows, not isolation boundaries.
Tables carry **no `tenant_id`**.

## Rationale

- No cross-tenant data isolation to enforce → dramatically simpler RLS.
- Fewer indexes and join predicates; simpler queries.
- Matches the actual product: one company operating its own workforce.

## Consequences

- If the product later becomes a multi-company SaaS, this is a significant
  migration (add `org_id` everywhere + rewrite RLS). We accept that risk given
  current scope and the value of simplicity now.
- A future **client portal** (customers viewing their own sites) can still be
  added as a *scoped read* role via RLS keyed on `client_id`, without full
  multi-tenancy — so the door is not fully closed.

## Revisit if

- The company wants to sell Sentinel to other security firms, or
- Regulatory isolation between clients becomes a contractual requirement.
