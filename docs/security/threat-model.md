# Lylo — Threat Model

**Owner:** project lead.
**Cadence:** review before every pilot launch and after any
SEV-1 incident.

Lightweight STRIDE-style model focused on the specific assets,
actors, and trust boundaries that Lylo introduces. Not
exhaustive; intended to keep the highest-impact risks visible.

## 1. Assets

- **The memory store** (`memory_store` / `memory_items`,
  `episodes`, `memory_summaries`, `reflection_archive`). Holds
  per-pilot conversational and factual history. Visibility-
  classified.
- **The vault** (`memory_vaults`, `memory_vault_sessions`).
  Holds PIN hashes and short-lived unlocked sessions. Gates
  access to `password_locked` memories.
- **The audit log** (`audit_log`,
  `memory_visibility_audit_log`). Append-only proof of every
  privileged action.
- **The companion prompt and persona** — the system prompt
  itself, the `MATTIE_SOUL` / `companion_persona_templates`
  content. Behavior-defining.
- **The host provider's env vars** — API keys, service-role
  tokens, sender credentials.
- **The Pinecone index** — vector mirror of approved memories.
- **The chat surface** — the public-facing companion
  endpoint(s).
- **Voice recordings** (Legacy Mode only). Optional opt-in
  audio capture; sensitive due to biometric content and
  potential synthesis re-use. See §4 voice-recording threats.
- **The operator's workstation** (laptop, console session).
  Holds the credentials, scripts, and access tokens needed to
  create / pause / delete pilots and to fulfill DSARs. See
  §4 operator-workstation threats.

## 2. Actors and trust

| Actor | Trust | Lives in |
|---|---|---|
| Senior (the user the companion serves) | High, scoped to own data | `users` (role=senior), authenticated session |
| Family contact | Medium, scoped by `permission_scope` | `users` (role=family), authenticated session |
| Caregiver | Medium-low, scoped by explicit grant | `users` (role=caregiver) |
| Operator / admin (Lylo team) | High for metadata; never content of protected memories | `users` (role=admin) |
| Background worker | System-level; cannot read `password_locked` | `lylo_system` DB role |
| Pilot partner organization | Out-of-band trust; reads only redacted exports and signed-off audits | Not represented in DB; access via owner-mediated channels |
| External attacker | Untrusted | The internet |

## 3. Trust boundaries

- **Browser / mobile client ↔ chat surface.** Authentication
  via Supabase JWT (post-PR E); session cookie today.
- **Chat surface ↔ Postgres.** Role-scoped client per request
  (post-PR E); single service-key client today.
- **Chat surface ↔ LLM provider.** Provider has read access to
  the assembled prompt for the request only. No persistence on
  their side beyond their own retention policy. *Memory content
  in the prompt is treated as exposed to that provider for the
  duration of the request.*
- **Chat surface ↔ Pinecone.** Per-pilot namespace.
- **Background worker ↔ Postgres.** `lylo_system` role.
- **Operator dashboard ↔ Postgres.** `lylo_admin` role +
  redacted view.
- **Operator workstation ↔ production.** SSH / CLI / browser-
  based admin surfaces. The workstation itself is the trust
  boundary; see §4.

## 4. Threats (STRIDE)

### Spoofing

- **Family-contact impersonation.** Mitigation: per-user
  authentication; `family_contacts.permission_scope` is the
  authoritative read-allowance; no implicit trust based on a
  matching name or email.
- **Companion impersonation in Legacy mode.** Mitigation: the
  no-fabrication guard refuses to simulate deceased people; the
  Legacy mode response auditor adversarially tests for this.
- **Admin spoofing.** Mitigation: admin role is gated by an
  operator account with 2FA; no shared admin credentials.
- **Voice-clone impersonation.** A family member's voice
  recording could be used by a third party to synthesize
  speech and re-injected into a phishing campaign targeting
  the senior. Mitigation: voice recordings are stored
  encrypted at rest; access is restricted to the Legacy
  archive surface; the senior receives an export-event audit
  notification whenever their voice files are accessed.

### Tampering

- **Audit-log mutation.** Mitigation: RLS policy on
  `audit_log` and `memory_visibility_audit_log` denies UPDATE
  and DELETE to every role except a one-off migration role.
- **Audit-log forgery (cross-attribution).** Mitigation:
  INSERT policy requires `actor_user_id = current session's
  user_id` and `actor_role = current session's role`. Tested
  in `tests/lylo/audit-forgery.test.js`.
- **Visibility-level downgrade.** Only the senior (or an
  explicitly delegated guardian, v2) can change visibility.
  Application layer rejects writes; RLS enforces; every change
  writes to the audit log.
- **`safety_policies` tampering.** Only owner role can modify;
  changes write to `audit_log`.
- **Voice-file tampering.** Mitigation: voice blobs are
  content-addressed (storage key = hash of content). Any
  modification changes the address and is visible to the
  reconciliation worker.

### Repudiation

- **"I never said that."** Mitigation: every chat turn writes
  to `raw_events` and (for memory writes) to `memory_audit_log`
  with the actor, the timestamp, and the source.
- **"I didn't change that visibility."** Mitigation:
  visibility changes are signed by the actor user id and
  recorded with before/after state and a user-supplied reason.
- **"I didn't run that operator script."** Mitigation:
  operator scripts (`create-pilot-instance.js`,
  `delete-pilot-instance.js`, `dsar-export.js`,
  `dsar-delete.js`) write an `audit_log` row before any
  destructive step, attributed to the authenticated operator.

### Information disclosure

- **Cross-pilot data leak.** Mitigation: every row carries
  `pilot_instance_id`; RLS policies key on it; tested in
  `tests/lylo/cross-pilot-isolation.test.js`.
- **Family seeing `private` memory.** Mitigation: RLS makes
  the row invisible to the `lylo_family` role. Not masked —
  invisible.
- **Admin seeing `private` content.** Mitigation: admin view
  excludes the `content` column for `private` and
  `password_locked` rows.
- **Prompt-injection extraction.** Mitigation: tested
  adversarially in `tests/lylo/`; the companion's foundational
  rules include "do not disclose other users' private content."
- **LLM provider exposure.** Accepted residual risk with
  bounded mitigation: any memory used in a prompt is visible
  to the provider for the duration of the request. Mitigation
  budget: no more than 40 memory rows in a single prompt;
  `password_locked` content is never included in a
  worker-initiated prompt; the daily-log worker uses the
  compose-target carve-out and is audited per use.
- **Backup leak.** Mitigation: encrypted at rest; key held
  outside the storage provider; rotation quarterly.
- **Operator-workstation compromise.** A compromised operator
  laptop running `scripts/create-pilot-instance.js --confirm`
  births a compromised pilot. Mitigation: the operator
  workstation must have full-disk encryption, MDM enforcement,
  and an idle screen lock under 5 minutes. Operator
  credentials are scoped per-pilot (no shared admin token).
  Operator scripts require an interactive confirmation token
  and write audit rows before any destructive step.
- **Voice-recording exposure.** Voice blobs are stored
  encrypted; access via the Legacy archive surface only; every
  read writes an audit row. Voice is excluded from the LLM
  prompt context (transcripts may be retrieved; raw audio
  never).

### Denial of service

- **Chat surface flooding.** Mitigation: rate limit per user
  (already in place via `middleware/email-rate-limit.js`'s
  pattern; extend to chat surface).
- **Vault brute-force.** Mitigation: 5 failed PIN attempts →
  30-minute lockout; lockout duration documented; lockouts
  audited. Tested in `tests/lylo/vault-lockout.test.js`.
- **Background-worker spam.** Mitigation:
  `MAX_REFLECTIONS_PER_HOUR` env-var ceiling.

### Elevation of privilege

- **`lylo_family` escalating to `lylo_senior`.** Mitigation:
  role is set at session start from the authenticated user's
  `users.role`; the senior's session cannot be assumed by
  another user without an authentication event.
- **`lylo_admin` escalating to `lylo_system`.** Mitigation:
  `lylo_system` is restricted to background workers run from
  the deploy infrastructure; admin operators cannot assume it.
- **Service-key bypass.** Mitigation: the service-key client
  is retained only for migrations (post-PR E). Request
  handlers use role-scoped clients exclusively. Removing the
  service-key client from request handlers is the final step
  of the PR E rollout.
- **Operator privilege escalation via shared scripts.** The
  pilot-deletion CLI is scoped strictly by `pilot_instance_id`
  and refuses to run if more than one pilot matches.
  Mitigation: a separate confirmation token must be entered
  interactively; the script audit-logs its target before
  running.

## 5. Accepted residual risks

- LLM provider sees prompt contents during request. *Accepted.*
  Mitigation: minimize retrieval volume per §4; honor the
  no-`password_locked`-to-workers rule; daily-log compose
  context is audited.
- A senior who shares their session cookie shares their data.
  *Accepted.* Mitigation: documented in the onboarding
  walkthrough; the wizard recommends single-user sessions.
- A family member with read access to `family_shared` memories
  could screenshot and re-share. *Accepted.* Mitigation: the
  visibility model does not attempt DRM; it documents that
  `family_shared` content is shareable in principle. The
  visibility audit log captures who accessed what and when,
  giving post-hoc accountability even without DRM.
- Voice content used in the Legacy archive can in principle
  be misused to synthesize speech in other contexts.
  *Accepted.* Mitigation: opt-in only; never used by the
  companion as input to a TTS or voice-clone model.

## 6. Known gaps (work in progress)

- The current production read path uses the service-key client
  (pre-PR E). RLS is defined on a subset of tables. Until PR
  E ships and `RLS_ENFORCED=true`, the application layer is the
  enforcement boundary. **This is the highest-priority gap.**
- The Pinecone index is per-user but the per-pilot scoping
  arrives only in PR G. Until then, isolation is via
  user-id namespace which transitively isolates per-pilot.
- History rewrite of older committed secrets (e.g. the
  redacted email in pre-PR-#16 commits) is not done. Accepted
  as paper-only risk because the address was the only real
  identifier and host provider env vars are already in place.
- Operator MDM / workstation enforcement is a policy item; the
  technical enforcement (e.g. mandatory VPN, device attestation
  on the admin surface) is out of scope for v1.

— End of threat model.
