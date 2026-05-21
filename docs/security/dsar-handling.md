# Lylo — Data Subject Access Request (DSAR) Handling

**Owner:** project lead.
**Cadence:** review before every pilot launch and after any DSAR
fulfilled. Update when retention or visibility rules change.

This document specifies how Lylo honors the senior's right to view,
export, and delete their own data. It is the operator runbook for
DSAR requests and the policy that pilot partners can show to their
compliance/legal contacts.

## 1. Who can file a DSAR

- **The senior** (the user whose memories the companion serves) for
  their own data.
- **A legally-authorized representative** (e.g. holder of a power
  of attorney) for the senior's data, with documentation verified
  by the pilot operator.
- **A family contact** for their own user record only (name,
  preferences, audit rows where they were the actor). Family
  contacts cannot file a DSAR on the senior's behalf without the
  legal authorization above.

The operator (Lylo team / pilot partner staff) does not file
DSARs; they fulfill them.

## 2. Request types

| Type | Result |
|---|---|
| Access (view) | Senior receives a readable, scoped report of every row in `memory_store`, `episodes`, `memory_summaries`, `reflection_archive`, `outbound_messages`, `user_profiles`, `family_contacts`, `memory_vaults`, and the audit logs that pertain to them. |
| Export (portability) | Same content as Access, packaged as a portable archive (JSON + voice blobs as files) the senior can take to another service. |
| Correction | Senior identifies a row whose content is wrong; operator helps the senior update or annotate it. |
| Deletion (soft) | The senior's rows are marked `active = false` with `deleted_at` and `deletion_reason`. Excluded from reads. Audit rows are preserved. |
| Deletion (hard) | After the 30-day grace period (or immediately on request), rows are hard-deleted. Derived rows recomputed. Vault material hard-deleted within 24 hours. Audit metadata about the deletion is preserved. |
| Restriction | Senior asks the system to stop processing specific categories (e.g. "don't proactively message me"). Operator sets the appropriate `safety_policies` flag for the pilot. |

## 3. SLA

- **Acknowledgment:** within 5 business days of the request.
- **Access / Export fulfillment:** within 30 days of
  acknowledgment by default; expedited on request.
- **Deletion (soft):** within 5 business days.
- **Deletion (hard):** at the end of the 30-day grace period, or
  immediately on request.
- **Correction:** within 10 business days of acknowledgment.
- **Restriction:** within 5 business days of acknowledgment.

If the SLA cannot be met, the operator notifies the senior in
writing with the cause and a revised date.

## 4. Operator runbook (per request)

1. **Intake.** Capture the request type, the requester identity,
   the senior's `user_id`, and (if delegated) the documentation
   proving authorization.
2. **Verify identity.** Senior verifies via the chat surface
   (already authenticated) or via an out-of-band channel
   pre-registered at setup. Delegated requesters present
   documentation; operator records the verification step in the
   audit log.
3. **Scope.** Confirm the request's scope (date range, topics,
   visibility levels). Default scope is *all rows* across all
   visibility levels owned by the senior.
4. **Build the export.** Run
   `scripts/dsar-export.js --user-id <id> --pilot-instance-id <id>`
   (lands with PR G). The export script:
   - reads with the `lylo_admin` role *and* the
     `app.compose_target_user_id` carve-out set to the senior
     (audited),
   - dumps the senior's rows from `memory_store`, the derived
     tables, `user_profiles`, `family_contacts`, `memory_vaults`,
     and the audit log,
   - bundles voice blobs as files alongside the JSON,
   - never reads any other user's data.
5. **Deliver.** Encrypted archive delivered via the senior's
   pre-registered channel. The export *itself* writes an
   `export_filtered` audit row with the count of rows included.
6. **Confirm.** Senior confirms receipt. Operator records the
   confirmation in the audit log.
7. **Close.** Operator closes the ticket. The export archive is
   retained for 30 days then deleted (operator does not keep
   permanent copies).

## 5. What is included in an export

For a senior named in `users.id = <senior>`:

- Every `memory_store` row with `owning_user_id = <senior>` and
  `active = true`. **Including `password_locked` rows** — the
  senior's own export overrides the vault-session requirement
  because the export is the act of "giving the senior their own
  data." The export script writes a `vault_session_expired` audit
  row (with `outcome = 'allowed'` and `reason = 'dsar_export'`)
  so the access is visible in the audit trail.
- Every `episodes`, `memory_summaries`, `reflection_archive` row
  with `owning_user_id = <senior>`.
- Every `outbound_messages` row addressed to or composed for
  `<senior>`.
- `user_profiles` row for `<senior>`.
- `family_contacts` rows where `senior_user_id = <senior>`.
- `memory_vaults` metadata (NOT the PIN hash, NOT the salt).
- `memory_visibility_audit_log` rows where the senior is the
  actor OR the memory is owned by the senior.
- Voice recordings referenced by the senior's `legacy_stories`,
  packaged as files.

## 6. What is excluded from an export

- Other pilots' rows (RLS guarantees this).
- Other users' rows in the same pilot (operator role + RLS
  filter).
- The vault PIN hash and salt.
- Operational logs that do not name the senior.
- Render env vars (out of scope).
- LLM provider's logs of past prompts (out of Lylo's control;
  noted in the threat model).

## 7. Hard delete

When a senior requests hard delete:

1. Operator confirms the senior understands the action is
   permanent.
2. Operator runs `scripts/dsar-delete.js --user-id <id> --confirm
   --confirm-token <ack>` (lands with PR G). The script:
   - Sets `active = false` and `deleted_at = now()` on every
     `memory_store` row.
   - Schedules hard delete after the 30-day grace period (or
     immediately if `--grace 0`).
   - On the actual hard-delete day: removes `memory_store` rows;
     marks derived rows `requires_recompute`; runs the recompute
     worker; hard-deletes `memory_vaults` and `memory_vault_sessions`;
     hard-deletes voice blobs; **preserves audit metadata** with the
     row's `content` set to `null`.
   - Pinecone vectors are deleted in the same transaction
     (best-effort, reconciled by a daily worker).
3. The senior receives written confirmation of the hard delete.

Audit metadata is preserved indefinitely for the 7-year retention
window specified in `docs/privacy/retention-policy.md`. After 7
years, the audit metadata is also hard-deleted.

## 8. Verification

The DSAR workflow is exercised quarterly by an operator drill:

- The operator picks a synthetic senior (from
  `scripts/demo-data-generator.js`), files a DSAR on their
  behalf, fulfills it end-to-end, then files a deletion request
  and runs it through the grace period.
- The drill is logged in `docs/security/incidents/<date>-dsar-drill.md`.
- The SLA times are measured against the documented targets and
  any miss is flagged for runbook revision.

## 9. What this document does NOT do

- Does not implement the CLI scripts (`dsar-export.js`,
  `dsar-delete.js`) — those ship with PR G.
- Does not specify the encrypted-archive format — a separate
  spec lands with the export script.
- Does not address GDPR / CCPA jurisdictional differences
  beyond best-practice scoped portability. If a pilot serves
  EU residents, additional review is required.
- Does not address subpoena / legal-hold workflows. Those go
  through `docs/security/incident-response.md`.

— End of DSAR handling policy.
