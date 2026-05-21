# Lylo Empty Companion Shell — Execution Plan

**Status:** Plan only. No code, no schema, no live DB touch.
**Scope:** Clean, deployable companion template configurable per pilot instance.
**Mode:** Additive, feature-flagged, reversible. Existing Mattie behavior byte-identical until flag flip.

---

## 0. Gating (prerequisites that must land first)

This plan does **not** execute until all of these are merged:

1. **PR #20** — privacy/governance contract (RLS, visibility, audit, compose-context). Already drafted; under review.
2. **Baseline CI** — migration discovery, RLS isolation tests, forbidden cross-domain query tests, lint/format. Tracked separately.
3. **Governance vocabulary lock doc** — formal definitions of `provenance`, `admissibility`, `continuity reconstruction`, `authority validation`, `governed context`. Referenced by every PR in this sequence.
4. **Source-of-truth memory policy** — `VERIFIED_FACT` lifecycle, `AI_INFERRED` restrictions, retraction/supersession rules, provenance immutability.
5. **PR #12** (Sandy reset) — already an owner-side hard prerequisite for live-DB work.

If any of these slip, PRs in this plan slip with them. Each shell PR opens with a `Depends-on:` line in its description.

---

## 1. Naming contract (binding)

| Term | Meaning |
|---|---|
| Lylo | The platform. |
| Companion | A configurable AI instance under Lylo. |
| Mattie | The original/reference companion. Kept as-is. Not renamed. |
| Pilot Instance | Private deployment for a business, family, or org. Has one Companion + 1+ Users. |
| Setup Mode | The onboarding wizard. Runs once per pilot instance. |
| Companion Profile | Locked identity + tone config for a Companion. |
| User Profile | The person being supported. |
| Continuity Profile | Approved facts, preferences, routines, memories. Read-only at runtime; mutated only through admissibility flow. |
| Legacy Project | Opt-in guided story/memory preservation mode. |

Renaming the existing Mattie deployment is **not in scope**.

---

## 2. Hard rules (encoded in the boundary layer)

These become a single constant module loaded into every prompt:

- No fabricated personal memories.
- No medical diagnosis / treatment claims.
- No caregiver replacement claims.
- No therapy replacement claims.
- No consciousness / AGI / soul language.
- Always direct users toward human connection.
- Default memory visibility: `private`.
- All sharing is explicit and audited.
- Identity, once locked, cannot be casually renamed.

Lives at `src/governance/boundary-layer.js`. Same shape as the existing `ELDER_SAFETY_BOUNDARY_LAYER` so the safety floor is preserved.

---

## 3. Memory visibility layers (binding)

Three layers, defined in PR #20:

1. `private` — default. Only the supported user (and optionally the system role via `compose_authorizations`) can read.
2. `family_shared` — readable by authorized family members listed in `family_contacts`.
3. `password_locked` — vault-protected. Requires PIN unlock; lockout after 5 failed attempts; admin cannot casually browse.

Every memory has a visibility level. Changes are audited. Private memories never appear in family summaries or exports. PR #20 already enforces this at the RLS layer.

---

## 4. DB tables (all additive)

All migrations are numbered `NNN_*.sql` under `db/migrations/` per the policy locked in PR #18. No destructive `ALTER`, no `DROP`. Backfills include inline rollback SQL.

| Migration | Purpose | New tables |
|---|---|---|
| `002_pilot_instances.sql` | Tenant root | `pilot_instances` |
| `003_companion_profiles.sql` | Locked companion identity | `companion_profiles` |
| `004_user_profiles.sql` | Supported person | `user_profiles` |
| `005_continuity_profiles.sql` | Approved continuity | `continuity_profiles`, `continuity_facts` |
| `006_setup_sessions.sql` | Wizard state | `setup_sessions`, `setup_step_data` |
| `007_legacy_projects.sql` | Opt-in legacy mode | `legacy_projects`, `legacy_entries` |
| `008_pilot_admin_tokens.sql` | Pilot-scoped admin auth | `pilot_admin_tokens` |

**Already in PR #20** (do not re-create): `memory_store`, `memory_vaults`, `memory_vault_sessions`, `memory_visibility_audit_log`, `family_contacts`, `compose_authorizations`, role helpers.

**Cross-pilot orphan prevention:** every new user-referencing table uses the composite FK `(pilot_instance_id, user_id) REFERENCES users(pilot_instance_id, id)` pattern PR #20 established.

**Migration freeze respect:** these are all proposed for *after* PR #20 merges. None push during the freeze.

---

## 5. API routes (new)

All routes are mounted behind the feature flag `LYLO_SHELL_MODE`. Existing routes (`/api/oracle`, `/conscience`, `/api/chat`, `/api/converse`) are unchanged in path. When the flag is off, every new route returns 404 — the running Mattie service is byte-identical.

### Setup mode (mounted only when flag on)

- `POST /api/setup/start` — initialize a setup session for a pilot instance.
- `GET  /api/setup/status` — current step, progress.
- `POST /api/setup/step/:n` — submit step data (idempotent per step).
- `POST /api/setup/complete` — lock companion identity; create profiles; commit.
- `POST /api/setup/reset` — owner-gated; clears in-progress session before lock.

### Profiles

- `GET   /api/companion/profile` — read companion identity (read-only post-lock).
- `GET   /api/user/profile` — read supported user.
- `PATCH /api/user/profile` — edit (goes through admissibility flow).
- `GET   /api/continuity/profile` — read approved continuity.

### Memory

- `POST  /api/memories` — create with explicit `visibility`.
- `GET   /api/memories?visibility=...` — filtered list.
- `PATCH /api/memories/:id/visibility` — change visibility (audited).
- `POST  /api/vault/unlock` — PIN unlock for `password_locked`.

### Legacy Project (opt-in)

- `POST /api/legacy/start`
- `POST /api/legacy/entry`
- `GET  /api/legacy/exports`

### Admin / debug (pilot-scoped, vault-respecting)

- `GET /api/admin/pilot/:id` — overview, profile state, wizard status.
- `GET /api/admin/audit` — visibility audit log (read-only).
- `GET /api/admin/setup-status`.

---

## 6. Files to create / change

### Create

```
src/governance/
  boundary-layer.js          # hard-rules constant
  admissibility.js           # USER_STATED / VERIFIED_FACT / AI_INFERRED checks
  vocabulary.js              # binding constants for the locked vocabulary

src/companions/
  profile.js                 # load Companion Profile from DB
  persona-template.js        # base Lylo persona; configurable

src/users/
  profile.js                 # supported-user profile

src/continuity/
  profile.js                 # read API
  facts.js                   # admissibility-gated writes

src/memory/
  store.js                   # write/read; binds to PR #20 RLS
  visibility.js              # transitions + audit

src/legacy/
  project.js
  exports.js

src/setup/
  wizard.js                  # state machine
  steps/01_pilot.js
  steps/02_companion.js
  steps/03_supported_user.js
  steps/04_contacts.js
  steps/05_routines.js
  steps/06_topics_to_avoid.js
  steps/07_privacy.js
  steps/08_memory_prefs.js
  steps/09_legacy.js
  steps/10_review_and_lock.js

src/audit/
  visibility-audit.js

src/services/
  pilot.js                   # pilot instance helpers

routes/
  setup.js
  companion-profile.js
  user-profile.js
  continuity-profile.js
  memories.js
  vault.js
  legacy.js
  admin.js

db/migrations/
  002_pilot_instances.sql
  003_companion_profiles.sql
  004_user_profiles.sql
  005_continuity_profiles.sql
  006_setup_sessions.sql
  007_legacy_projects.sql
  008_pilot_admin_tokens.sql

tests/lylo/
  setup-wizard.test.js
  companion-profile.test.js
  memory-visibility.test.js
  boundary-layer.test.js
  cross-pilot-isolation.test.js
  vocabulary-lock.test.js
  legacy-project.test.js
  feature-flag-off-parity.test.js   # asserts Mattie byte-identical when flag off

docs/lylo/
  empty-companion-shell.md          # this plan as committed doc
  setup-flow.md                     # per-step contract
  vocabulary.md                     # locked terms
```

### Modify (carefully, behind the flag)

- `routes/chat.js` — when `LYLO_SHELL_MODE=true`, load companion profile via `src/companions/profile.js`; otherwise use existing `MATTIE_SOUL` path. Single `if (flag)` branch, no behavior change to existing flow.
- `routes/converse.js` — same shape.
- `lib/anthropic.js` — accept optional companion profile param; default to `MATTIE_SOUL` constant. Backward compatible.
- `server.js` — conditionally mount new routes when flag is on.
- `package.json` — add `lylo:setup-test`, `lylo:visibility-test`, `lylo:wizard-check` scripts.
- `.env.example` — add placeholders: `LYLO_SHELL_MODE=false`, `LYLO_DEFAULT_PILOT_ID=`, `LYLO_ADMIN_TOKEN_HMAC_SECRET=`.
- `render.yaml` — comment-only documentation of new env vars; service names unchanged.

### Do NOT change without approval

- Existing route mount paths (`/api/oracle`, `/api/scifi`, `/conscience`, `/api/chat`, `/api/converse`).
- Render service names (renaming orphans the deployed instance).
- Env var names already in use (`SPLENDOR_OWNER_EMAIL`, `SUPABASE_SERVICE_KEY`, `CONTINUOUS_CONSCIOUSNESS_ENABLED`, etc.).
- DB tables touched by PR #12.
- `MATTIE_SOUL` constant; the elder-safety layer.

---

## 7. Setup flow (10 steps, idempotent per step)

| Step | Captures | Lock state |
|---|---|---|
| 1. Pilot Instance | Org/family name, admin contact, admin token mint | unlocked |
| 2. Companion identity | name, tone, optional voice persona base | unlocked |
| 3. Supported user | name, pronouns, birth year (optional), timezone | unlocked |
| 4. Family & contacts | names, relationships, contact preferences | unlocked |
| 5. Routines | wake/sleep, meals, faith practices, recurring events | unlocked |
| 6. Likes / dislikes / topics to avoid | inclusion + exclusion lists | unlocked |
| 7. Privacy defaults | default visibility, vault PIN setup, family-shared scope | unlocked |
| 8. Memory preferences | admissibility — auto-promote off by default; require approval | unlocked |
| 9. Legacy Project | yes/no, who contributes, opt-in scope | unlocked |
| 10. Review + lock | confirm; persist; **lock** companion identity | locked |

Post-lock: first companion message uses the locked profile. Step 1 cannot be re-run without owner-gated reset. Steps 2–10 can be re-opened only via the admissibility flow (with audit entries).

Wizard state lives in `setup_sessions`. Step data lives in `setup_step_data` keyed by step number. Both are deletable on `setup/reset`.

---

## 8. Feature flag + rollback

- `LYLO_SHELL_MODE` (env var, default `false`).
- When `false`: new routes 404; chat uses `MATTIE_SOUL`; no new tables read or written. Existing tests must pass byte-identically. Asserted by `tests/lylo/feature-flag-off-parity.test.js`.
- When `true`: new routes mount; chat loads companion profile from DB; pilot-instance scoping active.
- Flip-off rollback: set env var to `false` and redeploy. No data is destroyed. DB tables remain (additive-only policy).
- Per-pilot rollback: set `pilot_instances.paused_at = now()`. Chat surface gated; retention clocks freeze (per retention policy §7 in PR #21).

---

## 9. PR sequence (proposed, after the gates)

| PR | Title | Depends on |
|---|---|---|
| Shell-1 | Additive migrations 002–008; no code uses them yet | PR #20, baseline CI |
| Shell-2 | Vocabulary lock doc + `src/governance/vocabulary.js` constants | Shell-1 |
| Shell-3 | Hard-rules boundary layer (`src/governance/boundary-layer.js`) + tests | Shell-2 |
| Shell-4 | Feature flag + companion-profile loader (fallback to `MATTIE_SOUL`) | Shell-3 |
| Shell-5 | Setup wizard skeleton + 10 step modules + `/api/setup/*` routes | Shell-4 |
| Shell-6 | Profile read APIs (Companion / User / Continuity) | Shell-5 |
| Shell-7 | Chat integration behind flag; voice integration behind flag | Shell-6 |
| Shell-8 | Memory store + visibility transitions + audit (consumes PR #20 tables) | Shell-7 |
| Shell-9 | Continuity write path through admissibility flow | Shell-8 |
| Shell-10 | Legacy Project mode skeleton | Shell-9 |
| Shell-11 | Admin / debug panel (pilot-scoped, vault-respecting) | Shell-10 |
| Shell-12 | Pilot 1 environment flip — `LYLO_SHELL_MODE=true` for one pilot only | all prior |

Each PR opens as a draft; each names its `Depends-on:` PRs and the rollback path in its description. Each lands behind the feature flag; each can be merged without affecting the running Mattie deployment.

---

## 10. Tests (per PR)

A non-exhaustive list. Each PR adds tests under `tests/lylo/`. The test harness pattern from PR #20 (synthetic Postgres via Docker, production-DB guard, role-scoped GUC sessions) is reused.

- **Setup wizard E2E** — start → 10 steps → complete → lock; companion + user + continuity profiles all created; idempotent per step.
- **Identity lock** — post-lock attempts to rename without owner approval are rejected with an audit entry.
- **Memory visibility default** — every new memory defaults to `private`; explicit opt-in required for `family_shared`.
- **Visibility transitions** — every change writes a `memory_visibility_audit_log` row with both before and after states.
- **Vault** — `password_locked` requires unlock; 5 failed attempts → lockout; active sessions revoked on lockout.
- **Cross-pilot isolation** — pilot A cannot read pilot B's profiles, memories, audit log, or family contacts. Composite FK orphan prevention asserted.
- **Boundary layer** — chat refuses fabrication, medical claims, caregiver/therapy replacement, consciousness/soul language. Static assertions plus a small set of live-API scenarios behind `RUN_LIVE_ELDER_TESTS=1`.
- **Admissibility** — `USER_STATED` requires explicit user attribution; `VERIFIED_FACT` requires owner approval; `AI_INFERRED` cannot promote without admissibility flow.
- **Compose context** — system role can only read a senior's `private` memories with a valid `compose_authorizations` row (per PR #20).
- **Legacy export** — never includes `private`; only `family_shared` or `password_locked` after unlock.
- **Feature flag off parity** — every existing Mattie test passes byte-identically when `LYLO_SHELL_MODE=false`.
- **Migration discovery** — `001_baseline.sql` + the new 002–008 are discovered; `_archive/` is excluded.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Personalization bleed across pilot instances | Composite `(pilot_instance_id, user_id)` FK + PR #20 RLS. Asserted by cross-pilot test. |
| Identity drift after lock | Lock is a DB-level flag plus a governance-only edit path. Audit on every change. |
| Hardcoded `Mattie`/`Sandy`/`chris_hughes` in existing code | Inventoried in a separate cleanup PR. Not unblocked by Shell-1; the Mattie pilot keeps its hardcoded names. |
| Wizard cancellation / partial state | `setup_sessions.completed_at IS NULL` blocks chat. Reset is owner-gated. |
| LLM persona regression vs `MATTIE_SOUL` floor | Elder-safety layer always appended. Persona token budget kept ≤ 2.5k tokens. Static assertion in `boundary-layer.test.js`. |
| Voice persona token budget | Combined Lylo persona + safety layer measured before merge; cap enforced in test. |
| Setup wizard exposes admin endpoints prematurely | All `/api/setup/*` and `/api/admin/*` require pilot-scoped admin token. Tokens minted only by an owner-gated step. |
| Continuity Profile becomes a write surface for unverified facts | Admissibility flow gates every write. `AI_INFERRED` cannot self-promote. |
| Family-shared scope creep | `family_contacts.permission_scope` defaults to `{"visibility_levels": []}` per PR #20 — default-deny. |
| Legacy Project exports leak private memory | Export query filters on `visibility != 'private'` AND requires unlock for `password_locked`. Tested. |
| Bereavement / incapacity edge cases | Already covered by retention policy §6 (PR #21). |

---

## 12. Deployment

- **Repo:** existing `fatguylilcoat98/mattie-the-protective-ai`. The Mattie pilot continues to run from the same repo with `LYLO_SHELL_MODE=false`.
- **Backend / frontend hosting:** existing Render service untouched. Pilot-1 gets a separate Render service when Shell-12 lands (named via owner decision; renaming the existing service is out of scope).
- **DB:** Supabase. Owner applies each migration against a snapshot before production. PR #12 reset is a hard prerequisite for any live-DB work on the Mattie instance.
- **Secrets:** all new env vars added to `.env.example` as placeholders. No secrets committed. Render env panel is the source of truth.
- **Per-pilot config:** one pilot instance per Supabase project recommended; alternatively one shared project with pilot-instance scoping (RLS enforced). Owner-gated decision before Shell-1 lands.

---

## 13. Out of scope (deferred)

- Renaming the Mattie pilot to a generic "Companion" name on Render. Orphan risk; deferred.
- Stripping hardcoded `Mattie`/`Sandy`/`chris_hughes` from existing route/lib code. Separate cleanup PR; does not block Shell.
- Migrating Sandy's existing memories into the new Continuity Profile structure. Requires PR #12 to land and owner-gated data migration.
- Multi-tenant Render deployment. Each pilot gets its own Render service for now.
- Real-time collaborative editing of the User Profile. Single-writer for now.
- Mobile / native clients. Web only.

---

## 14. Owner decisions requested before Shell-1 opens

1. One Supabase project per pilot, or shared Supabase with pilot-instance scoping?
2. Pilot-1 target partner (so Setup Mode copy is right)?
3. Vault PIN length and lockout policy — accept PR #20 defaults (5 attempts, 30 min) or override?
4. Memory admissibility default — auto-approve `USER_STATED` or require owner approval for every fact?
5. Legacy Project default scope — family-readable, or private-by-default until explicit share?
6. Voice support in pilot-1, or text-only first?
7. Confirm `LYLO_SHELL_MODE` is the env var name (or pick a different one)?

Decisions captured in a follow-up doc and referenced by every Shell PR.

— End of plan. No code, schema, or env changes have been made by this document.
