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
- Writes a `visibility_read` audit row (post-hoc, with the
  original `content` set to `null` and `outcome = 'allowed'`
  to record the deletion).

## 3. Per-table retention

| Table | Retention | Notes |
|---|---|---|
| `memory_store` (active) | Indefinite (user-owned) | Soft-delete on request; hard-delete after grace period. Bereavement workflow in §6. |
| `episodes` (Tier-3) | 18 months (decay-scored) | The decay worker reduces score over time; compression worker folds low-score episodes into `memory_summaries`. |
| `memory_summaries` (Tier-4) | 5 years | Long-term compressed summaries. |
| `reflection_archive` | 5 years | Background reflection outputs. |
| `memory_visibility_audit_log` | **7 years** | Append-only. |
| `audit_log` (operational) | 2 years | Setup-mode and admin actions. |
| `memory_vault_sessions` | 30 days post-expiry | Then deleted. |
| `memory_vaults` (vault material) | Until the senior deletes themselves | Hard-deleted within 24 hours of user delete. |
| `legacy_stories` (preserved) | Indefinite | The senior may export, archive, or delete on request. Bereavement workflow in §6. |
| `outbound_messages` (drafted) | 90 days post-send | Includes the body for the audit window; then redacted to metadata only. |
| Backups | 30 days off-site | Encrypted, key held outside the storage provider. |

## 4. DSAR (Data Subject Access Request)

The DSAR workflow lives in `docs/security/dsar-handling.md`.
This policy defines the underlying retention; the DSAR doc
defines the operator runbook for handling requests.

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

## 6. Bereavement and incapacity

When the senior dies or becomes incapacitated, Lylo's posture
defaults to **preserve in place, deny new processing**.

- The pilot operator marks the pilot's senior record as
  `users.incapacity_status = 'deceased' | 'incapacitated'`,
  recorded with a date and the verification source (death
  certificate or guardian documentation).
- All write paths are halted: no new memory writes, no
  visibility changes, no background reflection cycles, no
  proactive messages addressed to the senior.
- Read paths are restricted to the senior's pre-designated
  legacy contacts (set during Setup Mode under the Legacy
  Project preferences). Those contacts may read `family_shared`
  and `preserved_story` rows only. `private` and
  `password_locked` rows remain invisible.
- A 12-month preservation window begins. During this window
  legacy contacts can request an export of `family_shared` and
  `legacy_stories` content via the standard DSAR workflow
  (with the operator verifying the legacy-contact
  authorization).
- At the end of the 12-month window, the operator follows the
  legacy-contact's written instruction:
  - **Archive:** legacy contacts receive the final export;
    pilot is soft-deleted per §5.
  - **Preserve:** the pilot transitions to a long-term legacy
    archive (read-only, no new writes, no companion access).
    Documented as a separate decision and re-confirmed every
    24 months.
  - **Delete:** the pilot is hard-deleted per §5 (with the
    grace period collapsed to zero on explicit instruction).
- The senior's vault material (`memory_vaults`) is
  hard-deleted at the 12-month boundary unless legacy contacts
  explicitly request retention for a future export. Vault
  retention beyond bereavement does not include the PIN — the
  vault is read by an operator-issued one-time access token.

This policy is invoked only with documented authorization. If
the documentation is contested, the policy halts: no reads, no
deletes, no exports until the dispute is resolved.

## 7. Pilot pause and resume

A pilot may be paused (e.g. while a senior is in extended
hospital care, while the pilot partner reorganizes, while the
family is reconfiguring contacts) without ending the pilot.

- The operator sets `pilot_instances.paused_at = now()` and
  `pilot_instances.pause_reason = '<text>'`.
- While paused:
  - The chat surface is gated: the companion responds with a
    "We're paused; check back soon" message instead of normal
    chat. The reply is recorded in the audit log.
  - Background workers (reflection, decay, compression,
    proactive) skip the paused pilot's rows.
  - DSAR requests are still honored.
  - No retention clocks advance during the pause window (e.g.
    the 30-day soft-delete grace period freezes).
- The pause may last up to 180 days. At day 180, the operator
  must either resume the pilot or convert the pause into a
  documented end (§5) or bereavement (§6) workflow.
- Resuming a pilot clears `paused_at` and writes an audit row.
  Retention clocks resume from where they froze.

If a pilot is paused and the senior dies during the pause, the
bereavement workflow (§6) supersedes the pause workflow.

## 8. What is never retained

- The vault PIN itself (only a salted hash).
- The raw request bodies sent to LLM providers (we log
  metadata only).
- Backup encryption keys in the storage provider (held
  separately).
- API keys, service tokens, sender credentials (host
  provider's environment-variable vault only).

— End of retention policy.
