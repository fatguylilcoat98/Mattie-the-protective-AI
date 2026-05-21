# src/audit

Domain: audit log writes, memory-visibility audit log writes,
retention enforcement, audit-log read views.

## What lives here (target state)

- `audit-log.{js,ts}` - the single function every privileged
  action goes through. Appends to `audit_log`.
- `visibility-audit-log.{js,ts}` - the append-only writer for
  `memory_visibility_audit_log`. Separate from `audit_log` because
  the access frequency and retention policy are different.
- `retention.{js,ts}` - 7-year retention on visibility audit log;
  shorter on operational `audit_log`. Soft-delete only;
  hard-delete requires explicit owner approval and is also
  audited.
- `views.{js,ts}` - the admin-facing audit views (e.g.
  `recent-visibility-changes`, `failed-vault-unlocks`).

## Non-negotiable rules

- Audit log writes never fail silently. If the audit row cannot
  be persisted, the originating action is aborted (fail-closed).
- Audit log rows are never updated or deleted by application
  code. RLS enforces this. A migration may correct a schema
  mistake; it cannot correct an audit-row mistake.
- Audit log rows include the actor, the role, the action, the
  target, the reason supplied by the actor, and the outcome.

## Lands in

Incrementally:

- PR D introduces the `memory_visibility_audit_log` table.
- PR E adds RLS policies that enforce append-only.
- A later PR moves the writer code from
  `lib/memory/audit-system.js` (and other scattered audit
  paths) into this module.

No code is added here by PR A.
