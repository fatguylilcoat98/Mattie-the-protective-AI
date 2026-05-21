# Lylo — Retention Policy

**Owner:** project lead.
**Cadence:** review before every pilot launch and after any
senior or pilot-partner-initiated deletion request.

## 1. Soft delete by default

When a senior asks to forget a memory, the system performs a
**soft delete**:

- `memory_store.active = false`
- `memory_store.deleted_at = now()`
- `memory_store.deletion_reason = '<user-supplied or default>'`

The row is excluded from all reads (RLS enforces). Pinecone
vector for that row is removed in the same transaction
(best-effort, reconciled by a daily worker).

## 2. Hard delete on request

A senior may request a hard delete. The system either:

- runs a hard delete immediately (small set), or
- queues the row for hard delete after a 30-day grace period
  (during which the senior can undo).

Hard delete:

- Removes the `memory_store` row.
- Removes the Pinecone vector.
- Marks any derived `episodes` / `memory_summaries` /
  `reflection_archive` rows that referenced this memory as
  `requires_recompute = true`; the next worker pass produces
  new derived rows.
- Writes an `event_type = 'visibility_read'` audit row
  (post-hoc, with the original `content` set to `null` and
  `outcome = 'allowed'` to record the deletion).

## 3. Per-table retention

| Table | Retention | Notes |
|---|---|---|
| `memory_store` (active) | Indefinite (user-owned) | Soft-delete on request; hard-delete after grace period. |
| `episodes` (Tier-3) | 18 months (decay-scored) | The decay worker reduces score over time; compression worker folds low-score episodes into `memory_summaries`. |
| `memory_summaries` (Tier-4) | 5 years | Long-term compressed summaries. |
| `reflection_archive` | 5 years | Background reflection outputs. |
| `memory_visibility_audit_log` | **7 years** | Append-only. |
| `audit_log` (operational) | 2 years | Setup-mode and admin actions. |
| `memory_vault_sessions` | 30 days post-expiry | Then deleted. |
| `memory_vaults` (vault material) | Until the senior deletes themselves | Hard-deleted within 24 hours of user delete. |
| `legacy_stories` (preserved) | Indefinite | The senior may export, archive, or delete on request. |
| `outbound_messages` (drafted) | 90 days post-send | Includes the body for the audit window; then redacted to metadata only. |
| Backups | 30 days off-site | Encrypted, key held outside the storage provider. |

## 4. DSAR (Data Subject Access Request)

A senior may at any time:

- **View** every row associated with their `user_id` across
  every table.
- **Export** their data in a portable format (JSON + voice
  blobs as files, packaged as a single archive).
- **Delete** their data (hard delete, with the 30-day grace
  period or immediate on request).

The DSAR workflow lives in
`docs/security/dsar-handling.md` (to be drafted).

## 5. Pilot-level retention

When a pilot ends:

- The pilot's data is retained for **90 days** after the
  documented end date, to allow late access requests and
  recovery from operator error.
- After 90 days, the pilot's rows are soft-deleted with
  `pilot_instances.deleted_at` set and a `deletion_reason`.
- After a further 90 days (180 days total), the pilot's rows
  are hard-deleted via `scripts/delete-pilot-instance.js`
  (the only CLI in Lylo authorized to perform tenant
  deletion). The pilot partner is notified before each step.

## 6. What is never retained

- The vault PIN itself (only a salted hash).
- The raw request bodies sent to LLM providers (we log
  metadata only).
- Backup encryption keys in the storage provider (held
  separately).
- API keys, service tokens, sender credentials (Render env
  vars only).

— End of retention policy.
