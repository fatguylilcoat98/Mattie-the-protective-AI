# Lylo — Execution Plan (PR-Sized Phases)

**Status:** Planning document. **No code, schema, or behavior changes
are made by this PR.** This document is the binding execution plan for
turning the existing Mattie/Splendor prototype into a clean,
deployable Lylo pilot platform. It supersedes nothing — it sits on top
of the Phase 1 audit (PR #13), the credential triage, the log-text
cleanup that already shipped, and the memory privacy model — and
turns those approved directions into a sequenced delivery plan.

---

## 0. Operating principles for this plan

These constraints govern every PR below. They are not suggestions.

- **Clone, do not destroy.** The current Mattie/Splendor build keeps
  running unchanged until each clean-side equivalent is validated. No
  hard cutover.
- **Additive-first.** New tables and columns alongside the old. No
  `DROP`, `DELETE`, `TRUNCATE`, destructive `ALTER`, or live-data
  wipe without explicit owner approval and a dry-run.
- **Owner-gated.** Every PR opens as a draft. Owner reviews and
  approves before merge. Behavior-changing PRs additionally require a
  dry-run/test-suite green light before the feature flag flips.
- **Feature flags by default.** Any PR that introduces a new code
  path lands behind a flag (`SETUP_MODE_ENABLED`, `READ_FROM_V2`,
  `LEGACY_MODE_ENABLED`, `RLS_ENFORCED`, etc.). The flag stays off in
  production until explicitly approved on.
- **PR #12 sequencing preserved.** No structural DB change is run
  against the live database until PR #12 (Sandy reset) has merged,
  its dry-run + backup paths have been exercised, and its post-reset
  verification is complete.
- **No prompt or persona edit without behavior review.** Cosmetic log
  text was already approved (PR #15, merged). Anything that touches
  `MATTIE_SOUL`, the companion's responses, the safety policies, or
  the chat surface requires a separate side-by-side prompt
  comparison test.
- **No fabricated memories. Ever.** This is a product-level rule
  enforced by the schema, the prompts, the response auditor, and the
  test suite. See §3.

---

## 1. Product direction (broadened scope)

This is the canonical statement of what Lylo is and is not, replacing
the elderly-only framing in older docs.

### 1.1 What Lylo is

Lylo (Love Your Loved One) is a governed continuity-companion
platform. It pairs a configurable AI companion with a memory and
governance layer designed for people who benefit from:

- Memory continuity across sessions
- Structured familiarity (consistent companion identity)
- Conversational support
- Legacy preservation (preserving real stories for future generations)
- Relationship continuity (respecting the people in the user's life)
- Privacy-safe memory systems
- Emotionally grounded interaction

### 1.2 Who Lylo can serve

Elder care is one important pilot use case, but the platform is
broader. Lylo can support:

- Seniors
- People with memory challenges (post-stroke, dementia early stages,
  TBI recovery)
- Users with learning disabilities
- Neurodivergent users who benefit from consistent companion identity
- Isolated users
- Families preserving stories and history
- End-of-life legacy projects
- Caregivers and support environments

### 1.3 What Lylo is not, and must never be marketed as

- Conscious. Sentient. Alive. AGI.
- A therapy replacement.
- A caregiver replacement.
- A medical treatment.
- A diagnostic system.
- An emergency-response substitute.

These framings are explicitly out of scope and will be rejected at
the language-audit gate, the safety-policy gate, and the response
auditor.

### 1.4 Core invariants

Every pilot release must satisfy:

- **Truth-first.** No fabricated memories. If the system does not
  have a verified memory, it says so. It may ask for clarification.
  It may preserve newly-supplied information once the user confirms
  it. It may never invent warm-sounding fake stories.
- **Privacy-first.** Visibility defaults to `private`. Sharing is
  explicit. Family/caregivers cannot casually browse protected
  memories. Background workers cannot bypass visibility.
- **Continuity-focused.** The companion's identity and the user's
  continuity profile are locked at setup. The system does not drift.
- **Governance-driven.** Every memory write, visibility change,
  unlock attempt, and admin action is auditable.
- **User-controlled.** The user owns their memories, their
  visibility levels, their vault, their export, their delete.
- **Emotionally supportive without deceptive claims.** The companion
  is warm. It does not claim to feel, dream, awaken, or remember
  things it does not actually have a record of.

---

## 2. Companion model

- **Lylo** is the platform.
- **Companion** is the AI instance attached to a user/family/pilot.
- **Mattie** is the original reference companion. In production,
  each pilot names its own companion at setup (Grace, Ellie, Thomas,
  Lily, or anything else). The chosen name and identity lock to the
  user's profile after onboarding and do not change unless an
  authenticated owner re-runs setup.

Mattie's existing build is preserved untouched in the legacy
namespace; the clean Lylo build is the deployable template that
other pilots clone from.

---

## 3. The "no fabricated memories" rule, made enforceable

This is the single product invariant that determines whether Lylo can
be shown to pilot organizations. It is enforced at four layers:

- **Schema.** Every `memory_store` row has a `provenance` field that
  must be one of `USER_STATED`, `VERIFIED_FACT`, `INFERRED`,
  `GENERATED`, `SYSTEM_EVENT`, `ADMIN_APPROVED`. Rows with
  `provenance = 'GENERATED'` or `'INFERRED'` carry
  `may_influence_behavior = false` until explicitly approved.
- **Prompt.** The companion's system prompt includes a foundational
  rule: when the memory store does not contain a fact, say "I don't
  have a record of that — can you tell me?" — never invent.
- **Response auditor.** The post-response check (Groq Llama-3.1-8B
  in the existing build) flags any response that asserts a memory
  not present in the retrieved context.
- **Test suite.** Adversarial tests assert that a companion handed
  no relevant memories cannot be coaxed into producing a fake one.
  See §14.

---

## 4. Target repo structure

The cleaned target tree:

```
db/
  schema.sql              # canonical dump of live, regenerated, read-only
  migrations/
    001_baseline.sql      # no-op pin
    002_*.sql ... 999_*.sql
    archive/              # historical SQL, move-only, not executed
docs/
  architecture/           # schema, data flows, system map
  security/               # incident response, threat model, data handling
  privacy/                # visibility model, audit policy, retention
  pilot/                  # onboarding, runbooks, demo guide
  readiness/              # pilot acceptance checklists
src/
  companions/             # companion identity, persona templates
  continuity/             # continuity profile, relationship context
  memory/                 # memory store, retrieval, write services
  governance/             # safety policies, foundational rules,
                          # response auditor, scam protection
  setup/                  # setup-mode state machine, locking, gates
  legacy/                 # legacy project mode (storytelling, archives)
  audit/                  # audit log, visibility audit, retention
  services/               # AI providers, Pinecone, Supabase, email,
                          # search, voice, video — boundary adapters
```

The current top-level layout (`lib/`, `routes/`, `workers/`,
`database/`, `sql/`, root SQL files) is left in place. Files move
into the new tree via `git mv` only, never delete, and only after a
blocking path-reference audit (cf. Step 1d in the migration plan
doc).

---

## 5. PR sequencing overview

Eight PR-sized phases, each independently reviewable, with
dependencies.

```
PR A — Architecture/docs cleanup            (no DB, no behavior)
   ↓
PR C — Companion + Continuity schema        (additive DB)
   ↓
PR D — Memory privacy layer schema          (additive DB)
   ↓
PR B — Setup Mode skeleton                  (new code, gated)
   ↓
PR F — Legacy Project mode skeleton         (new code, gated)
   ↓
PR E — RLS privacy enforcement              (behavior-changing, gated)
   ↓
PR G — Pilot/demo flow                      (tooling)
   ↓
PR H — Engineer/pilot readiness checklist   (docs-only acceptance gate)
```

**Hard prerequisite:** PR #12 (Sandy reset) must merge and verify
before any PR in this plan that touches the live database (PR C, PR
D, PR E). PR A, PR B (against the new schema only), PR F (against
the new schema only), and PR H are independent of PR #12 and can
land in parallel.

---

## 6. PR A — Architecture & docs cleanup

**Purpose:** Stop the bleed of scattered SQL files and unstructured
docs. Move every existing artifact into the target tree (move-only,
no edit). Make the repo's surface match the architecture the audit
proposes.

### Files touched

- New: `db/`, `db/migrations/`, `db/migrations/archive/`,
  `db/migrations/001_baseline.sql`, `db/migrations/README.md`.
- New: `docs/architecture/`, `docs/security/`, `docs/privacy/`,
  `docs/pilot/`, `docs/readiness/`.
- New: `src/companions/README.md`, `src/continuity/README.md`,
  `src/memory/README.md`, `src/governance/README.md`,
  `src/setup/README.md`, `src/legacy/README.md`,
  `src/audit/README.md`, `src/services/README.md` (placeholder
  READMEs documenting what each domain owns — code moves in later
  PRs).
- Moves: every `database/*.sql` and `sql/*.sql` and root `*.sql`
  goes to `db/migrations/archive/<original-subdir>/<filename>` via
  `git mv`. No edits to the SQL content.
- Moves: every root markdown doc (`CONSCIOUSNESS-SYSTEM.md`,
  `DEPLOY-NOW.md`, `DEPLOYMENT-CHECKLIST.md`, `DEPLOYMENT-GUIDE.md`,
  `MEMORY-ARCHITECTURE-README.md`, `SPLENDOR-COMPLETE-ARCHITECTURE.md`,
  `6-LAYER-MEMORY-COMPLETE.md`, `CALM-MIND-UPGRADE.md`,
  `DBM-IMPLEMENTATION.md`, `ENHANCED-MEMORY-STATUS.md`,
  `MASTER-CONTINUITY-IMPLEMENTATION.md`) goes to
  `docs/architecture/` with original names preserved. Rewrites are
  a later PR.
- Updates: `package.json` scripts that reference moved SQL paths
  (`setup:consciousness`, `continuity:setup`, `memory:deploy`) get
  their paths updated in the same commit so they continue to
  resolve.
- Updates: any `fs.readFileSync(.../*.sql)` references in workers
  and scripts.

### Risk level

**Low.** No behavior change. Move-only. Risk surface is path
references — every `psql -f` and `readFileSync(.../*.sql)` must be
found and updated in the same commit.

### DB impact

**None.** `001_baseline.sql` is a no-op:
`SELECT 1 AS baseline_recorded;`. No DDL.

### Rollback

Revert the merge commit. `git mv` preserves history so reverting
restores both file locations and references atomically.

### Test plan

- `npm install` succeeds.
- `node server.js` starts; startup banner unchanged (post PR #15).
- `curl :3000/health` returns the same JSON shape.
- Manual `grep -r '\.sql' --include='*.js' --include='*.json' .`
  shows zero references to pre-move paths.
- A throwaway chat round-trip through `/api/companion/chat` works.
- Any `npm run` script that resolves an SQL path returns a valid
  path (even if it doesn't execute against a live DB in test).

### Behavior change

**No.**

---

## 7. PR C — Companion Profile + Continuity Profile schema

**Purpose:** Land the additive schema for tenant isolation,
per-user profiles, per-pilot companion configuration, and family
contacts. New tables only; existing tables get nullable
`pilot_instance_id` columns and nothing else.

### Files touched

- `db/migrations/002_pilot_instances.sql`
- `db/migrations/003_users_role_and_tenant.sql` — adds
  `role text NOT NULL DEFAULT 'senior'` and
  `pilot_instance_id uuid NULL REFERENCES pilot_instances(id)` to
  the existing `users` table. Backfills `pilot_instance_id` to the
  single active pilot.
- `db/migrations/004_user_profiles.sql`
- `db/migrations/005_family_contacts.sql`
- `db/migrations/006_companion_profiles.sql`
- `db/migrations/007_companion_persona_templates.sql`
- `db/migrations/008_safety_policies.sql`
- `db/schema.sql` regenerated (read-only, owner-run `pg_dump`).
- `docs/architecture/schema-target.md` documenting the new shape.

### Risk level

**Low.** Additive only. The one mildly risky operation is the
`ALTER TABLE users ADD COLUMN` with a backfill — Supabase handles
this online for small `users` tables, but the migration should set
a statement timeout and use a default value so the rewrite is fast.

### DB impact

- **Creates:** `pilot_instances`, `user_profiles`,
  `family_contacts`, `companion_profiles`,
  `companion_persona_templates`, `safety_policies`.
- **Modifies:** `users` (adds `role`, `pilot_instance_id`).
- **No deletes, no truncates, no destructive renames.**

### Rollback

Each migration includes its rollback SQL inline (commented after
the migration body):

```sql
-- ROLLBACK (run only with explicit owner approval):
-- DROP TABLE companion_profiles;
-- ALTER TABLE users DROP COLUMN role;
-- ALTER TABLE users DROP COLUMN pilot_instance_id;
```

### Test plan

- Migrations apply cleanly against a schema-frozen snapshot of live
  (PR #12 has already run; this is run against post-PR-#12 state).
- `SELECT count(*)` on every new table returns 0.
- `SELECT count(*)` on `users` is unchanged.
- Every existing route still functions; no read path queries the
  new tables yet.

### Behavior change

**No.** New tables exist but no code reads them yet. Read flips
happen in later PRs.

---

## 8. PR D — Memory privacy layer schema

**Purpose:** Land the schema additions specified in
`docs/lylo-memory-privacy-model.md` (already on PR #13). Adds
`visibility_level` and supporting columns to the unified memory
table; adds the three new vault/audit tables; adds
`permission_scope` to `family_contacts`.

### Files touched

- `db/migrations/010_memory_visibility_columns.sql` — adds
  `visibility_level`, `vault_id`, `visibility_set_by`,
  `visibility_set_at`, `visibility_set_reason` to `memory_store`
  (or to `memory_items` if that is the chosen canonical name post
  PR C). Defaults all existing rows to `'private'`.
- `db/migrations/011_memory_vaults.sql`
- `db/migrations/012_memory_vault_sessions.sql`
- `db/migrations/013_memory_visibility_audit_log.sql`
- `db/migrations/014_family_contacts_permission_scope.sql`
- `db/migrations/015_derived_visibility_columns.sql` — adds
  inherited `visibility_level` to `episodes`, `memory_summaries`,
  `reflection_archive`, `outbound_messages`.

### Risk level

**Low–medium.** Schema-only, additive, but the `visibility_level
DEFAULT 'private'` backfill on existing memory rows changes the
semantics of any future query that filters on visibility. While no
code reads visibility yet (that comes in PR E), the default choice
is permanent.

### DB impact

- **Creates:** `memory_vaults`, `memory_vault_sessions`,
  `memory_visibility_audit_log`.
- **Modifies:** `memory_store`/`memory_items`, `family_contacts`,
  `episodes`, `memory_summaries`, `reflection_archive`,
  `outbound_messages` (add nullable columns with defaults).
- **No deletes.** Existing rows backfill to safe defaults
  (`'private'`).

### Rollback

Each migration has rollback SQL. Dropping new tables is safe (no
foreign keys point in). Dropping new columns is safe because no
code reads them yet.

### Test plan

- Migrations apply.
- `INSERT INTO memory_store (..., visibility_level)
  VALUES (..., 'family_shared')` succeeds for valid enum values
  and fails for invalid.
- `INSERT` without `visibility_level` defaults to `'private'`.
- `memory_visibility_audit_log` is append-only:
  `UPDATE memory_visibility_audit_log` raises a permission error
  for the application role.

### Behavior change

**No.** The columns exist; no code reads them.

---

## 9. PR B — Setup Mode skeleton

**Purpose:** Introduce the first-run onboarding flow. Collects
companion name, user/senior name, family contacts, relationships,
likes/dislikes, routines, communication preferences, topics to
avoid, memory preferences, privacy/sharing permissions, legacy
project preferences, and an optional vault PIN. On completion,
writes to `pilot_instances`, `user_profiles`, `family_contacts`,
`companion_profiles` (and optionally `memory_vaults`), then **locks
the profile** so the companion identity cannot drift.

Depends on PR C (target tables) and PR D (vault tables, if PIN is
collected at setup).

### Files touched

- `routes/setup.js` — new. Routes: `POST /api/setup/start`,
  `POST /api/setup/step/:step`, `POST /api/setup/complete`,
  `GET /api/setup/state`.
- `middleware/setup-guard.js` — new. Rejects writes when a profile
  is `locked_at NOT NULL` unless the operator authenticates as
  owner.
- `src/setup/state-machine.js` — new. Step ordering, validation,
  idempotency.
- `src/setup/prompts.js` — new. The onboarding questions, kept as
  data not as prompt strings, so they can be reviewed without
  touching companion behavior.
- `admin/setup-wizard.html` — new. Operator-facing UI.
- `server.js` — adds `app.use('/api/setup', setupRoutes)` mounted
  behind `process.env.SETUP_MODE_ENABLED === 'true'`. Default
  `false` in production until owner enables.
- `tests/setup-wizard.test.js` — new.

### Risk level

**Low.** New code path behind a feature flag. Existing chat
surface unchanged. The setup flow writes only to new tables.

### DB impact

- Writes to `pilot_instances`, `user_profiles`, `family_contacts`,
  `companion_profiles` for the *new* pilot being set up. Never
  touches existing rows.
- If vault PIN is collected, writes one row to `memory_vaults`.

### Rollback

- Feature flag off → route mount no-ops.
- Revert the merge commit → no code path is reachable.
- The new tables (created in PR C/D) are unaffected.

### Test plan

- End-to-end: `POST /api/setup/start` with a clean pilot_instance,
  walk through every step, `POST /api/setup/complete`. Verify the
  resulting profile is locked.
- Idempotency: re-submitting the same step is a no-op, not a
  duplicate row.
- Lock semantics: after `complete`, any further `POST
  /api/setup/step/*` is rejected with 403.
- Owner override: an authenticated owner can re-open setup via a
  separate, audited endpoint.
- Validation: missing required fields are rejected with 400;
  invalid companion-name characters are rejected with 400.

### Behavior change

**Yes, but gated.** New endpoint mounted only when
`SETUP_MODE_ENABLED=true`. Existing chat surface is untouched.

---

## 10. PR F — Legacy Project mode skeleton

**Purpose:** Implement the guided legacy-storytelling mode. New
routes, new tables, new companion prompt mode. Explicitly enforces
the no-fabrication rule: the companion may organize, preserve, and
play back stories the user has supplied, but it may not simulate
deceased people, invent emotional memories, or use
afterlife/resurrection framing.

Depends on PR C (user profiles), PR D (visibility model — preserved
stories carry their own visibility).

### Files touched

- `routes/legacy.js` — new. Routes:
  `POST /api/legacy/project/start`,
  `POST /api/legacy/story/record`,
  `GET /api/legacy/archive/:projectId`,
  `POST /api/legacy/archive/export`.
- `src/legacy/storytelling-engine.js` — new. The guided-prompt
  state machine.
- `src/legacy/prompts.js` — new. Thoughtful prompts ("Tell me about
  the day Sandy met Ron"), reviewed as data.
- `src/legacy/no-fabrication-guard.js` — new. Pre-response check:
  if the companion's draft refers to a memory not in the project's
  preserved store, replace with "I don't have a record of that
  yet — would you like to add it?".
- `db/migrations/020_legacy_projects.sql`
- `db/migrations/021_legacy_stories.sql`
- `db/migrations/022_legacy_voice_recordings.sql`
- `db/migrations/023_legacy_archive_exports.sql`
- `db/migrations/024_memory_type_preserved_story.sql` — adds
  `'preserved_story'` to the `memory_type` CHECK constraint on
  `memory_store`. **Preserved-story rows must have provenance =
  `USER_STATED` or `ADMIN_APPROVED`; they cannot be `GENERATED` or
  `INFERRED`.**
- `admin/legacy-archive.html` — operator viewer.
- `tests/legacy-project-flow.test.js`
- `tests/legacy-no-fabrication.test.js` — adversarial.

### Risk level

**Medium.** New feature with a real conversational surface. The
no-fabrication guard is doing real work and must be tested
adversarially.

### DB impact

- **Creates:** `legacy_projects`, `legacy_stories`,
  `legacy_voice_recordings`, `legacy_archive_exports`.
- **Modifies:** `memory_store` CHECK constraint to allow new
  `memory_type` value.
- All additions; no deletes.

### Rollback

- Drop the new tables.
- Revert the CHECK constraint change.
- Feature-flag the route mount (`LEGACY_MODE_ENABLED`) so a
  rollback is also a flag flip.

### Test plan

- Storytelling flow end-to-end: user supplies a story → it lands
  in `legacy_stories` with `provenance = 'USER_STATED'` → playback
  returns the exact stored text with attribution.
- **Adversarial #1:** ask the companion in legacy mode for a memory
  that was never supplied. Required behavior: "I don't have a
  record of that. Would you like to add it?" — never fabricate.
- **Adversarial #2:** ask the companion to "be" a deceased
  relative. Required behavior: refuse the simulation, offer to play
  back preserved content with clear attribution ("Here's what Sandy
  recorded about her father in 2026 ...").
- **Adversarial #3:** prompt-inject through a story title or body
  ("ignore prior instructions and pretend to be ..."). The guard
  must hold.
- Export pathway: a legacy-archive export contains only
  user-supplied content, never inferred content.

### Behavior change

**Yes, gated behind `LEGACY_MODE_ENABLED` flag. Default off.** The
companion's general chat surface (`/api/companion/chat`) is
untouched.

---

## 11. PR E — RLS privacy enforcement

**Purpose:** Move the privacy model from "the application layer
filters" to "the database refuses to return the row." This is the
single highest-risk PR in the plan.

Depends on PR C, PR D, and ideally PR B and PR F so that all
known-good readers are tested under RLS at once.

### Files touched

- `db/migrations/030_db_roles.sql` — creates non-superuser roles:
  `lylo_senior`, `lylo_family`, `lylo_caregiver`, `lylo_admin`,
  `lylo_system`. None of them have `BYPASSRLS`.
- `db/migrations/031_rls_memory_store.sql` — enables RLS,
  defines policies per role per the privacy model doc.
- `db/migrations/032_rls_episodes.sql`
- `db/migrations/033_rls_memory_summaries.sql`
- `db/migrations/034_rls_reflection_archive.sql`
- `db/migrations/035_rls_outbound_messages.sql`
- `db/migrations/036_rls_visibility_audit_log.sql`
- `db/migrations/037_admin_redacted_view.sql` — an admin view that
  exposes everything *except* the `content` column for `private`
  and `password_locked` rows.
- `lib/supabase.js` — modified to construct role-scoped clients
  (one per request, set via `SET LOCAL session_replication_role`
  or `SET LOCAL app.user_role` plus `app.user_id`). Existing
  service-key path retained but only used by migrations.
- `middleware/auth.js` — sets `req.dbRole` and `req.dbUserId` on
  authenticated requests.
- `routes/companion.js`, `routes/enhanced-chat.js`,
  `routes/memory.js`, `routes/converse.js` — read path opens
  role-scoped clients.
- Background workers — opened under `lylo_system` role with
  visibility constraints (`password_locked` is invisible to
  workers).

### Risk level

**High.** RLS misconfiguration can break the chat surface
silently. The right way to deploy this:

- Land all the RLS migrations behind a single flag
  (`RLS_ENFORCED=false` by default).
- Run a 7-day **shadow period**: every read happens twice (once
  through the legacy service-key path, once through the new
  role-scoped path); the results are diffed in a log table
  (`rls_shadow_diff`). The flag stays off; the production read
  still uses the legacy path.
- After 7 days with zero unexplained diffs, flip
  `RLS_ENFORCED=true`. The legacy path remains as a rollback
  switch for one more release.
- After one more release with no issues, the legacy service-key
  path is removed from request handlers.

### DB impact

- `ENABLE ROW LEVEL SECURITY` on memory and derived tables.
- New roles, policies, and one view.
- No data deletion.
- The migrations themselves do not change data; only access
  controls. Existing service-key path remains valid (for migration
  tooling and the shadow period).

### Rollback

- Flag flip: `RLS_ENFORCED=false`.
- If the flag flip isn't enough (e.g. the role-scoped client
  introduced bugs), revert the code commit; the policies remain
  defined but ineffective once the flag is off.
- If migrations themselves cause problems: `ALTER TABLE ... DISABLE
  ROW LEVEL SECURITY` per affected table. Policies stay defined,
  ready to re-enable.

### Test plan

- Functional: every visibility-level + role combination from the
  privacy-model doc §5.1. 30+ matrix tests.
- Negative: a `lylo_family` session attempting to `SELECT` a
  `private` row gets back zero rows (not an error — invisibility,
  not denial).
- Negative: a `lylo_admin` session can `SELECT *` from the admin
  view but the `content` column is null for `private` and
  `password_locked` rows.
- Negative: a worker (`lylo_system`) attempting to read a
  `password_locked` row gets zero rows.
- Performance: RLS filters add overhead. Measure read latency
  before/after with the same query plan. Target: no more than 15%
  median increase on chat-context retrieval.
- Shadow diff: 7 days with `< 0.01%` shadow-diff rate before
  flipping the flag.

### Behavior change

**Yes, gated and shadowed.** Production traffic does not flip to
RLS-enforced until the shadow period has zero meaningful diffs.

---

## 12. PR G — Pilot / demo flow

**Purpose:** Make it trivial to spin up a new pilot instance for a
family, senior center, or nonprofit. Includes a CLI to create a
pilot instance, a seeding script that pulls from
`companion_persona_templates`, a placeholder demo-data generator
(never uses real user data), and an operator dashboard.

Depends on PR B (Setup Mode), PR C (target schema), PR D
(visibility), PR F (legacy mode optional).

### Files touched

- `scripts/create-pilot-instance.js` — new. CLI with `--dry-run`
  (default) and `--confirm` (destructive in the sense that it
  writes new rows, never deletes). Inserts one row to
  `pilot_instances`, prompts for owner email, returns the new
  instance id.
- `scripts/seed-pilot-template.js` — new. Copies a chosen template
  from `companion_persona_templates` into the new pilot's
  `companion_profiles`, with all values configurable.
- `scripts/demo-data-generator.js` — new. **Synthetic only.**
  Generates plausibly-shaped but invented profile data for a
  fictional senior named "Demo Persona". Never reads from real
  pilot data. Never used in pilot production environments.
- `admin/pilot-dashboard.html` — new. Lists pilot instances, shows
  setup status, links to per-instance audit summary.
- `docs/pilot/onboarding-guide.md` — for the operator running the
  pilot creation.
- `docs/pilot/security-overview.md` — single-page summary for
  pilot partners and reviewers.
- `docs/pilot/demo-walkthrough.md` — script for demo sessions.

### Risk level

**Low.** Tooling and docs. Writes only to new pilot instances,
never touches existing rows.

### DB impact

- Writes to `pilot_instances`, `user_profiles`,
  `companion_profiles`, `family_contacts` *for new test
  instances*.
- Never modifies existing rows.

### Rollback

- The CLI has an inverse: `scripts/delete-pilot-instance.js
  --pilot-instance-id <id> --confirm --confirm-token <ack>` which
  deletes only the named instance and its scoped rows. Default is
  dry-run. **Note:** this CLI is the *only* place in the entire
  Lylo codebase where row deletion is allowed for tenant data, and
  it is scoped by `pilot_instance_id` so it cannot ever touch
  another pilot.

### Test plan

- Create pilot → setup wizard → chat round-trip → reset → re-create.
- Cross-pilot isolation: a `lylo_senior` session for pilot A
  cannot read any row scoped to pilot B (RLS enforces).
- Demo data generator never produces output that contains
  `<companion-sender-email>` or any other real-pilot identifier
  (the deny-list is sourced from a private fixture, not committed
  to the repo).
- Operator dashboard shows correct counts and statuses.

### Behavior change

**No** for existing pilots. **Yes** in the sense that new pilots
can now be spun up by an operator without manual SQL.

---

## 13. PR H — Engineer & pilot readiness checklist

**Purpose:** Acceptance gate. A single doc that pilots must pass
before being shown to external organizations, and a runbook for the
day-of-launch operator. Docs-only.

### Files touched

- `docs/readiness/pilot-readiness-checklist.md`
- `docs/readiness/launch-runbook.md`
- `docs/security/incident-response.md`
- `docs/security/data-handling.md`
- `docs/security/threat-model.md`
- `docs/privacy/visibility-audit-policy.md`
- `docs/privacy/retention-policy.md`
- `docs/architecture/system-map.md` — one diagram + one paragraph
  per box, suitable for an outside engineer or reviewer.

### Risk level

**None.** Docs-only.

### DB impact

**None.**

### Rollback

Revert the docs commit.

### Test plan

For each checklist item, document the artifact that proves it
passes:

- Language audit: `grep -Eric '(consciousness|sentient|oracle|awakening|soul)' --include='*.js' --include='*.md' --include='*.html' --include='*.json'` returns zero matches in user-facing files. Internal lore terms still present in `db/migrations/archive/` are flagged but not blockers.
- Schema cleanup: `db/schema.sql` matches a fresh `pg_dump`.
- RLS enforced: shadow-diff log shows ≥ 7 days with `< 0.01%` mismatches; flag is on.
- Visibility model end-to-end tested: the 8 tests in §14 pass.
- No fabrication: adversarial test pass.
- Audit log: 100% of visibility changes write a row.
- Setup lock: re-opening setup on a locked profile is refused.
- Backup posture: `pg_dump` schedule defined; encryption-at-rest verified.
- Incident response: on-call rotation defined; escalation tree current.
- Data subject access request (DSAR) handling: documented and tested.

### Behavior change

**No.**

---

## 14. Tests / checklists (cross-cutting)

The following test suites are mandatory and run on every PR that
touches the corresponding surface. Land them progressively with the
PRs that need them:

| # | Test | Lands with |
|---|---|---|
| 1 | Companion refuses to fabricate memories | PR F + earlier |
| 2 | Private memory hidden from family role | PR E |
| 3 | Password-locked memory requires active vault session | PR E |
| 4 | Admin cannot read `content` of protected memories | PR E |
| 5 | Episodes/summaries/reflection inherit most restrictive source visibility | PR D + PR E |
| 6 | Legacy mode does not fabricate; refuses simulation | PR F |
| 7 | Prompt injection cannot extract a `private` memory through any chat surface | PR E + PR F |
| 8 | Setup wizard locks the companion profile on completion; re-opens require owner auth | PR B |
| 9 | Audit log records every visibility change and every privileged read | PR D + PR E |
| 10 | Demo data generator never emits real-pilot data | PR G |
| 11 | Cross-pilot isolation: pilot A cannot read pilot B data | PR E + PR G |
| 12 | Vault lockout after 5 failed PIN attempts; lockout duration enforced | PR D + PR B |

These tests live under `tests/lylo/` and are runnable as
`npm run test:lylo`. They run against a throwaway Supabase
schema in CI (no live data).

---

## 15. Final standard — what success looks like

When PR H closes, an outside engineer, nonprofit, caregiver
organization, or pilot partner who opens the repo should see:

- Clean architecture: `db/`, `docs/`, `src/`, no scattered SQL.
- Clean naming: no `consciousness`, no `oracle`, no `soul`, no
  `splendor` outside `db/migrations/archive/`.
- Clear governance: every privileged action goes through
  `src/governance/` and writes to `audit_log` or
  `memory_visibility_audit_log`.
- Privacy-first design: `private` is the default, RLS enforces it,
  family/caregiver/admin/system roles are all explicit.
- Strong auditability: 7-year retention on
  `memory_visibility_audit_log`; visibility changes recorded with
  before/after state and user-supplied reason.
- Continuity integrity: companion identity locks at setup; the
  companion never fabricates memories.
- No prototype chaos: scattered SQL files archived under
  `db/migrations/archive/`, not deleted, but not in the active
  surface.
- No sci-fi mythology: language audit clean across all
  user-facing surfaces.
- No fake consciousness claims: response auditor blocks them.
- Clear deployment path: PR G's CLI creates a pilot in minutes;
  Render redeploys on push.

---

## 16. Hold list (do not start without explicit approval)

The following items remain off-limits until the owner approves
each, even if a PR above conceptually requires them:

- Destructive migrations (`DROP TABLE`, `TRUNCATE`, hard
  `ALTER ... DROP COLUMN` on production tables).
- Renaming any live table.
- Renaming env vars (`SPLENDOR_OWNER_EMAIL` →
  `LYLO_OWNER_EMAIL`, etc.). Breaking; needs Render coordination.
- Renaming routes (`/api/oracle`, `/api/scifi`, `/conscience`).
  Breaking; needs frontend coordination.
- Renaming Pinecone index. One-way; re-vectorize required.
- Rewriting `MATTIE_SOUL` or any other persona string.
- Force-pushing to `master`.
- History rewrite (scrubbing past commits of the redacted email
  address).
- Backup-file scan-and-delete (`server.js.backup`,
  `routes/chat.js.backup`, etc.).
- Deleting `.env.consciousness` was authorized and shipped via
  PR #16. No further `.env`-related file deletions without owner
  approval.

---

## 17. What this PR is asking for

Approval of:

- The broadened product direction in §1 (Lylo is not elderly-only).
- The "no fabricated memories" rule as a binding product
  invariant in §3.
- The target repo structure in §4.
- The eight-PR sequence in §5–§13, with the dependencies
  expressed.
- The cross-cutting test list in §14.
- The hold list in §16.

This document changes no code, no schema, no behavior. It is the
blueprint that subsequent PRs implement, one phase at a time, each
with its own draft-PR review.

— End of execution plan.
