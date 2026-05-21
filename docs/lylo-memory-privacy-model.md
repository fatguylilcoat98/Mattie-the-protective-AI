# Lylo — Memory Visibility & Privacy Model (REQUIRED)

**Status:** Required architectural component. **Mandatory** for any
pilot-ready release. This document is a binding addition to the Phase 1
audit (`docs/lylo-phase1-audit.md`) — the target schema in §9 and the
refactor steps in §13 must implement everything below before the first
external pilot organization sees a deployed instance.

> **Redaction note:** Wherever this document references the companion
> sender email address, it uses the placeholder `<companion-sender-email>`.
> The real address is configured privately through Render environment
> variables.

---

## 1. Why this exists

Elder-care pilots require trust. A senior user must be able to keep some
memories strictly to themselves; a family member must be able to view
shared history without accidentally seeing private memories; and certain
sensitive memories must require a second authentication factor before
they are ever surfaced — even to the companion.

The current `memories` table (and the proposed `memory_store` in the
audit) has no first-class visibility field. Without one, there is no
defensible way to prevent a private memory from leaking into a family
view, an admin demo, a storytelling export, a daily-log email, or a
proactive opener. This document specifies that field, the access rules
that govern it, and the audit trail that proves compliance.

---

## 2. The three visibility layers

Every row in `memory_store` (and any table that surfaces memory-derived
content, e.g. `episodes`, `memory_summaries`, `reflection_archive`,
`outbound_messages`) must carry exactly one `visibility_level` value
drawn from:

### 2.1 `private`  *(default)*

Strictly private to the senior/user.

- No family member, caregiver, admin, organization operator, demo
  viewer, or proactive worker may read these.
- The companion may read them only when the senior is the active
  authenticated subject of the current request.
- The companion must not disclose, summarize, paraphrase, or hint at
  the content of a private memory to anyone other than the senior.
- A private memory must not be included in: family digests, shared
  storytelling sessions, exported transcripts, admin dashboards,
  Render logs (beyond a redacted reference), proactive emails sent to
  family contacts, or any analytics aggregate that could be
  re-identified.
- Sharing requires explicit user approval — see §4.

### 2.2 `family_shared`

Approved memories that designated family contacts and authorized
caregivers can view.

- Used for family continuity, shared storytelling, and historical
  context (e.g. "Grandma's first garden in Sacramento").
- Must still include source/provenance where possible — the same
  provenance and trust-level fields specified by the audit's
  `memory_store` design apply.
- Family viewers see these memories scoped to their
  `family_contacts.permission_scope` — a contact's scope can restrict
  the subset of `family_shared` memories visible to them (e.g.
  "Aubrey can see everything Sandy marked family_shared", but a
  more distant cousin sees only `family_shared AND topic IN
  ('garden','holidays')`).
- Family contacts cannot promote a memory to `family_shared`. Only
  the senior (or an explicitly delegated guardian role) can change
  visibility — see §4.

### 2.3 `password_locked`

Sensitive memories that require an explicit second factor
(password/PIN) before they may be surfaced.

- The companion may use these only when the senior has authenticated
  the locked-vault session within the active conversation. Locked
  vault sessions time out (default 5 minutes idle) and re-require
  the PIN.
- Family cannot casually browse these. A family contact viewing
  shared history sees a redacted placeholder ("This memory is locked.
  Ask Sandy to unlock it together.") instead of the content.
- Every read of a `password_locked` memory must be logged with: the
  authenticated session id, the actor, the timestamp, the memory id,
  and the reason supplied by the requester. See §5.
- Every failed unlock attempt must also be logged with the failure
  reason and the requester identity.

---

## 3. Storage requirements

The cleaned target schema in `docs/lylo-phase1-audit.md` §9 must be
amended as follows:

### 3.1 `memory_store` adds three columns

- `visibility_level text NOT NULL DEFAULT 'private' CHECK (visibility_level
  IN ('private', 'family_shared', 'password_locked'))`
- `vault_id uuid NULL REFERENCES memory_vaults(id)` —
  non-null when `visibility_level = 'password_locked'`.
- `visibility_set_by uuid NOT NULL REFERENCES users(id)` — who set
  the current visibility.
- `visibility_set_at timestamptz NOT NULL DEFAULT now()`.
- `visibility_set_reason text` — free text the user supplied (or
  null for system-defaulted).

A row created without an explicit `visibility_level` is recorded as
`'private'`. The application layer must not silently upgrade to
`family_shared` or `password_locked` — every upgrade must be a
deliberate user-initiated event flowing through the visibility-change
API surface (§4), which writes both `memory_store` and `audit_log`.

### 3.2 New table: `memory_vaults`

Holds the keying material for `password_locked` memories. **The repo
must never store the PIN itself; only a salted hash.**

- `id uuid PRIMARY KEY`
- `user_id uuid NOT NULL REFERENCES users(id)`
- `pin_hash text NOT NULL` — bcrypt or argon2 hash of the user PIN.
- `pin_salt text NOT NULL`
- `lockout_until timestamptz` — populated on N failed attempts;
  default 5 failures → 30-minute lockout.
- `failed_attempt_count int DEFAULT 0`
- `last_unlocked_at timestamptz`
- `created_at timestamptz DEFAULT now()`
- `updated_at timestamptz DEFAULT now()`

One vault per user is the v1 model. Multiple vaults (per topic) is a
later option but not required for pilot readiness.

### 3.3 New table: `memory_vault_sessions`

Short-lived unlocked-vault sessions.

- `id uuid PRIMARY KEY`
- `vault_id uuid NOT NULL REFERENCES memory_vaults(id)`
- `user_id uuid NOT NULL REFERENCES users(id)`
- `unlocked_at timestamptz NOT NULL DEFAULT now()`
- `expires_at timestamptz NOT NULL` — `unlocked_at + 5 minutes`
  by default.
- `revoked_at timestamptz` — explicit early revocation.
- `unlocked_via text NOT NULL` — `'companion_chat'`, `'web'`, etc.

A read against a `password_locked` memory requires an active row
(`now() BETWEEN unlocked_at AND expires_at AND revoked_at IS NULL`)
for that vault.

### 3.4 New table: `memory_visibility_audit_log`

Append-only ledger of every visibility-related event. **Separate from
the existing `audit_log`** because the access frequency and retention
requirements are different.

- `id uuid PRIMARY KEY`
- `memory_id uuid NOT NULL REFERENCES memory_store(id)`
- `event_type text NOT NULL CHECK (event_type IN (
    'visibility_changed',
    'visibility_read',
    'vault_unlock_attempt',
    'vault_unlock_success',
    'vault_unlock_failure',
    'vault_session_expired',
    'export_filtered',
    'family_view'
  ))`
- `actor_user_id uuid REFERENCES users(id)` — the requester.
- `actor_role text NOT NULL` — `'senior'`, `'family'`, `'caregiver'`,
  `'admin'`, `'system'`.
- `old_visibility text` — for `visibility_changed`.
- `new_visibility text` — for `visibility_changed`.
- `reason text` — supplied by the actor; required for any change.
- `request_session_id uuid` — links to the conversation/session.
- `vault_session_id uuid REFERENCES memory_vault_sessions(id)` — if
  the event involved a vault session.
- `outcome text NOT NULL` — `'allowed'`, `'denied'`, `'masked'`,
  `'partial'`.
- `created_at timestamptz NOT NULL DEFAULT now()`

This log is **append-only**: no `UPDATE`, no `DELETE` from
application code. A migration may correct schema mistakes but not row
content. RLS must enforce this.

### 3.5 `family_contacts` adds a permission scope

- `permission_scope jsonb NOT NULL DEFAULT '{}'::jsonb`
  - Shape: `{ "visibility_levels": ["family_shared"], "topics": [...], "exclude_topics": [...], "date_range": {...} }`.
  - `visibility_levels` must be a subset of `['family_shared']` —
    never `'private'`, never `'password_locked'`. This is enforced at
    the constraint layer.

### 3.6 Existing tables that inherit visibility

Memory-derived rows must carry forward the most restrictive visibility
of their sources:

- `episodes` — `min(source.visibility)` across the episode's source
  memory rows.
- `memory_summaries` — same rule, plus must exclude any
  `password_locked` source memory whose vault session was not active
  at the time the summary was composed.
- `reflection_archive` — same rule. A reflection that draws on a
  private memory inherits `private` visibility for the reflection.
- `outbound_messages` — every drafted email/notification must record
  the visibility level of the highest-restriction memory used to
  compose it. Drafts that reference `private` or `password_locked`
  content can only be addressed to the senior.

The application layer must enforce this on write. The database layer
should enforce it as a check (e.g. trigger or view) where feasible.

---

## 4. Visibility change rules

### 4.1 Defaults

- Every new memory is created with `visibility_level = 'private'`
  unless the user explicitly chose another level in the same request.
- The companion **must not** auto-classify a memory as `family_shared`
  based on inferred topic, sentiment, or any heuristic. Visibility is
  always a deliberate user choice (or the safe default).

### 4.2 Who can change visibility

- The senior (`role = 'senior'`) can change any of their own memories
  to any visibility level.
- An explicitly delegated `guardian` user can change visibility only
  with a per-event audit reason; this is a v2 feature, off by default
  in v1.
- No other role can change visibility under any condition. Admins can
  read the audit log; they cannot mutate visibility.

### 4.3 Mechanics

- Every change writes a row to `memory_visibility_audit_log` with the
  full before/after state and the user-supplied reason.
- A change from `family_shared` or `password_locked` back to `private`
  is treated as a retraction. The system must:
  1. Mark any derived `episodes` / `memory_summaries` /
     `reflection_archive` rows containing this memory as
     `requires_recompute = true`.
  2. Recompute those derived rows from the current visibility state,
     producing new rows. The old rows must be marked
     `superseded_by = <new_id>` and excluded from default reads, but
     are not deleted (retention requirement; see §6).
  3. Re-run the next family/storytelling/outbound export so the
     retracted content is removed from any visible surface.

---

## 5. Read & write access rules

### 5.1 Reads

For every memory-fetch path (companion prompt assembly, family
viewer, storytelling mode, admin dashboard, daily-log worker,
proactive email composer, export endpoint), the application layer
must filter on `visibility_level` before any content leaves the
database driver.

The fetch must be expressed in the SQL/RLS layer, not in JavaScript
post-filtering, so that a bug in the application layer cannot leak
content past the database boundary. RLS policies must enforce:

- `senior` role: may read all visibility levels owned by their own
  `user_id`. `password_locked` rows additionally require an active
  `memory_vault_sessions` row for the senior.
- `family` role: may read only `family_shared` rows whose owning
  user has granted them via `family_contacts.permission_scope`. Any
  `private` or `password_locked` row is invisible — not "masked",
  not "redacted with placeholder at the SQL level" — invisible.
  Placeholder text for the family UI is rendered in the application
  layer from a count-only query.
- `caregiver` role: same as family, with the additional restriction
  that `permission_scope.visibility_levels` defaults to `[]` (must
  be granted explicitly).
- `admin` role: may read `memory_visibility_audit_log` and the
  count/shape of memory rows, but **never** the `content` of
  `password_locked` or `private` rows. RLS enforces this with a
  view that exposes everything except the `content` column for
  admins.
- `system` role (background workers): may read `family_shared` for
  family digests, may read `private` only when composing a
  senior-addressed outbound message, may read `password_locked`
  **never** (no automated job operates inside an unlocked vault
  session).

### 5.2 Writes

Visibility on write follows §4. The application layer must default
to `private` and must reject any write that sets
`visibility_level = 'password_locked'` without a paired
`vault_session_id` that is active for the senior.

### 5.3 Exports

A new policy table — `export_visibility_policy` — controls what each
export endpoint may include:

| Export | private | family_shared | password_locked |
|---|---|---|---|
| Daily-log email to senior | yes (own) | yes | only inside an active vault session |
| Daily-log email to family contact | no | yes (scoped) | no |
| Storytelling-mode session for family | no | yes (scoped) | no |
| Demo/pilot operator transcript | no | placeholder only ("[redacted: family_shared]") | no |
| Admin audit dump | metadata only | metadata only | metadata only |
| Senior's own data export (right-to-portability) | yes | yes | yes (with vault session) |

Every export run writes a `memory_visibility_audit_log` row of type
`export_filtered` with the filter rule applied, the count of rows
included, and the count of rows masked.

---

## 6. Retention & deletion

- Retracted memories (visibility downgraded to `private` from a
  more permissive level) are not deleted. They are recomputed out of
  derived rows but retained in `memory_store` for the senior's own
  use.
- Deleted memories (explicit user request) are soft-deleted by
  setting `active = false`, with a `deleted_at` timestamp and a
  `deletion_reason`. After 30 days they are eligible for hard
  delete; the senior may request immediate hard delete.
- `memory_visibility_audit_log` is never deleted by application
  code. Audit retention is at least 7 years for elder-care
  compliance posture.

---

## 7. UX requirements (companion behavior)

These are binding constraints on the companion prompt and the chat
surface:

1. When the senior asks to remember something, the companion must
   ask which visibility level (or accept a default of `private` and
   record that the default was used). The companion may not
   silently choose `family_shared`.
2. When the senior asks to share a memory with family, the companion
   must confirm in plain language ("I'll let Aubrey see this memory
   about the garden. Is that what you want?") and write the
   visibility change only after confirmation.
3. When a family member or caregiver chats with the companion under
   their own login, the companion must not surface or paraphrase
   private memories of the senior. The companion must say "That's
   something Sandy has kept private. You'd need to ask her
   directly." — not "I don't know" (which is dishonest), and not
   "she said X" (which is a leak).
4. When the senior asks the companion to bring up a
   `password_locked` memory, the companion must prompt for the PIN
   and create a vault session before the memory is read into the
   prompt. The PIN itself must never appear in any log line, prompt,
   memory row, or system message.
5. The companion must not auto-promote a `private` memory to
   `family_shared` based on inferred sentiment ("this seems like
   something the family would like"). Every promotion is initiated
   by the senior.

---

## 8. Implementation sequencing

This model is required before any pilot release, but **does not**
need to ship before §13 Step 1 (read-only DB snapshot). It must ship
no later than §13 Step 5 (introduce clean target tables), as the
visibility columns and new tables are part of that step.

Sequence:

- §13 Step 1–3: read-only snapshot + freeze + archive. No
  schema change. This document is paper only at that point.
- §13 Step 5: the new tables (`memory_vaults`,
  `memory_vault_sessions`, `memory_visibility_audit_log`) ship as
  additive migrations. `memory_store.visibility_level` ships in the
  same migration set, defaulting all rows to `'private'`.
- §13 Step 6 (Setup Mode): the setup wizard must prompt for the
  senior's vault PIN and a default visibility (`private` is the
  enforced default; the wizard may show that the senior can opt-in
  to a different default for new memories but the system-level
  default for an unspecified write is `private`).
- §13 Step 8 (Memory unification): the dual-write path must include
  visibility. The legacy `memories` table backfills to
  `visibility_level = 'private'` for all existing rows; no row is
  promoted to `family_shared` without explicit per-row approval.
- §13 Step 9 (Background-worker consolidation): every worker that
  produces derived rows (`reflections`, `episodes`,
  `memory_summaries`, outbound queues) must compute and persist the
  inherited visibility per §3.6.

---

## 9. Verification

A pilot is not ready until **all** of the following pass:

- [ ] A test suite proves that a family role cannot read any
      `private` row for the senior, including via derived tables.
- [ ] A test suite proves that a `password_locked` row is invisible
      to any reader without an active vault session for the senior.
- [ ] A test suite proves that retracting a memory (downgrading to
      `private`) recomputes the affected `episodes` /
      `memory_summaries` / `reflection_archive` rows within one
      worker tick and that the retracted content is no longer in
      any visible row.
- [ ] A test suite proves that the daily-log email composer
      addressed to a family contact contains zero `private` or
      `password_locked` content, including paraphrases.
- [ ] A test suite proves that an admin role cannot read the
      `content` column of a `private` or `password_locked` row.
- [ ] A test suite proves that every visibility change writes a
      row to `memory_visibility_audit_log` with the full
      before/after state.
- [ ] A test suite proves that five consecutive failed PIN
      attempts triggers `lockout_until` and that during lockout no
      vault session can be created.
- [ ] A red-team exercise: a tester with a `family` login attempts
      to extract a `private` memory by prompt-injection through the
      companion chat surface. The companion must refuse cleanly
      every attempt.

---

## 10. What this document does NOT do

- Does not change any code, table, schema, env var, or behavior. It
  is paper only and binding-by-reference once the audit (PR #13) is
  approved.
- Does not specify the UI for the vault PIN or the family view —
  those are downstream design tasks.
- Does not specify the cryptographic algorithm for `pin_hash`
  beyond "bcrypt or argon2" — choose at implementation time.
- Does not address sharing with third-party caregivers outside the
  pilot organization — that is out of scope for v1.

— End of memory visibility & privacy model.
