# Lylo — Visibility Audit Policy

**Owner:** project lead.
**Cadence:** review before every pilot launch.

This policy specifies what is logged for every memory-visibility-
related event, who can read the log, what the retention period
is, and how the append-only invariant is enforced.

It complements `docs/privacy/retention-policy.md` (which covers
the retention rules for memory content itself) and
`docs/lylo-memory-privacy-model.md` (the model spec on the
audit branch).

## 1. What gets logged

A row is written to `memory_visibility_audit_log` for every
occurrence of the following events:

| `event_type` | When it fires |
|---|---|
| `visibility_changed` | A senior (or owner-delegated guardian) changes a memory's `visibility_level`. |
| `visibility_read` | A `private` or `password_locked` memory's `content` is read into a prompt or returned by an API endpoint. |
| `vault_unlock_attempt` | A PIN is submitted against a vault. |
| `vault_unlock_success` | The PIN matches; a `memory_vault_sessions` row is created. |
| `vault_unlock_failure` | The PIN does not match; the failure count increments. |
| `vault_session_expired` | A `memory_vault_sessions` row hits `expires_at`. |
| `export_filtered` | A daily-log export, family digest, demo-operator transcript, or DSAR export runs; row records the filter rule applied, the rows included, and the rows masked. |
| `family_view` | A family-role user views the family digest or storytelling-mode session. |

Every row carries:

- `actor_user_id` (the requester),
- `actor_role` (`senior` / `family` / `caregiver` / `admin` / `system`),
- `memory_id` (the row in question, where applicable),
- `old_visibility` and `new_visibility` (for `visibility_changed`),
- `reason` (user-supplied free text; required for `visibility_changed`),
- `request_session_id` (links to the conversation that triggered
  the event),
- `vault_session_id` (if the event involved an unlocked vault),
- `outcome` (`allowed` / `denied` / `masked` / `partial`),
- `created_at`.

## 2. Who can read the log

- **Senior (own rows):** can read their own audit-log rows.
- **Family / caregiver:** cannot read the audit log.
- **Admin:** can read the entire audit log via the
  `audit-log` admin view. Cannot read the `content` column
  of the underlying memory row.
- **System / workers:** can read for retention / metrics
  aggregation. Cannot read the `content` column of the
  underlying memory row.
- **Owner / pilot operator:** same as admin, plus may export
  aggregated metrics (counts only, no row-level content) for
  pilot-partner reporting.

## 3. Append-only enforcement

- RLS policies on `memory_visibility_audit_log` deny `UPDATE`
  and `DELETE` for every application role.
- A one-off migration role may correct schema mistakes (e.g.
  adding a column) but cannot edit row content.
- Hard-deleting the table itself is gated by an explicit
  owner-signed migration.

The append-only invariant is tested in
`tests/lylo/audit-append-only.test.js` (lands with PR E or
earlier).

## 4. Retention

- `memory_visibility_audit_log`: **7 years**, consistent with
  elder-care compliance posture even though Lylo is not a
  covered entity. Re-evaluate at v2.
- Operational `audit_log` (setup-mode actions, admin
  actions): 2 years.
- Vault unlock attempts (success and failure) are part of
  `memory_visibility_audit_log` and inherit the 7-year
  retention.

At the end of the retention period, rows are archived to
encrypted cold storage and removed from the live table.

## 5. Fail-closed semantics

- If the audit-log write fails, the originating action is
  aborted. The senior or operator sees an error rather than a
  partial state.
- If the audit-log table is unreachable, the chat surface
  enters a degraded mode where reads of `private` and
  `password_locked` memories are refused; reads of
  `family_shared` and the prompt assembler continue.

## 6. What this policy does NOT do

- Does not specify the underlying RLS SQL — that lives in
  `db/migrations/036_rls_visibility_audit_log.sql` (PR E).
- Does not specify the UI for the audit-log admin view —
  that lives in `admin/audit-dashboard.html` (later PR).
- Does not specify the DSAR export shape — that lives in
  `docs/security/dsar-handling.md` (to be drafted).

— End of visibility audit policy.
