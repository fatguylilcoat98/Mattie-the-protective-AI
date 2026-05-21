# Lylo Phase 1 — Architecture Audit and Cleanup Plan

**Status:** Phase 1 audit only. **Documentation-only.** No code, schema,
production data, or behavior has been changed by this commit.

**Scope of audit:**
- `fatguylilcoat98/mattie-the-protective-ai` (master) — the working backend, DB,
  routes, workers, admin, prompts, schemas. This is the real product.
- `fatguylilcoat98/lylo-website` (main) — separate Next.js marketing site.

**Rules I followed during the audit:**
- Did not delete anything.
- Did not rename production tables.
- Did not run destructive migrations.
- Did not wipe memory.
- Did not simplify away working behavior.
- Did not alter any prompt or system text.
- Did not change behavior.
- This document is the deliverable for explicit approval before any
  production-impacting change.

**Existing in-flight work I am NOT duplicating:**
- Open draft PR `#12` (`claude/fix-supabase-table-error-Za0gG`) already covers
  Sandy-specific memory-reset tooling and a Legacy Memory design doc. This
  audit is **broader and structural** — it does not touch Sandy seeds, the
  reset script, or the legacy-memory spec. Where they overlap I call it out
  explicitly and defer to that PR.

---

## 0. One-paragraph summary

The working system is `mattie-the-protective-ai`. Underneath it is an
Express + Supabase (Postgres) + Pinecone backend with a webpack-bundled
React/Three.js front-end served from `public/mattie.html`, plus several Render
cron workers. It works. The trouble is that it has been iterated on top of
itself five or six times: there are at least four parallel memory schemas,
three different `consciousness_state` shapes, two `splendor_decisions`
definitions, two `reflections` definitions, multiple `conversation_sessions`
definitions, 25+ SQL files in `database/`, 13 more in `sql/`, several at the
repo root, and a heavy layer of speculative "consciousness/oracle/soul"
branding in code, file names, env vars, table names, logs, and docs. The
functionality is real and largely good. The presentation and structure are not
ready to be shown to engineers, partners, or pilot organizations. This document
proposes a cleanup that preserves every working behavior and migrates the
surface into a professional Lylo companion platform without breaking what
already ships.

`lylo-website` is a small standalone Next.js 14 landing page. It is not
wired to the backend, has no DB, and is essentially independent. It is in
reasonable shape and only needs minor hygiene (stale `out/` and `legacy/`
folders). The bulk of this audit is about `mattie-the-protective-ai`.

---

## 1. Current database table inventory

> Note on method: this inventory is drawn from the SQL files committed in the
> repository. The **actual** set of tables in the live Supabase project is
> almost certainly a strict subset of these definitions — many were drafts or
> superseded. Before any migration, Step 0 of the refactor plan (§13) is to
> snapshot the **live** schema directly from Supabase and reconcile against
> this list. Treat the inventory below as "every table the repo *believes*
> exists."

### 1.1 Memory / conversation tables (largest cluster, heaviest duplication)

| Table | Defined in | Notes |
|---|---|---|
| `memories` | (legacy, referenced from `lib/supabase.js` via `storeMemory` / `getMemoriesForUser`) | The actively-used long-term store. `routes/companion.js` and the voice/converse paths read/write here. **Critical, do not touch.** |
| `memory_items` | `database/complete-fresh-deploy.sql` | V2 unified memory store, governance-aware (approval_status, trust_level, retrieval_allowed, may_influence_behavior, provenance, supersedes). Used by the enhanced/V2 path. |
| `memory_categories` | `database/complete-fresh-deploy.sql` | Folder system for `memory_items`. |
| `memory_sources` | `database/complete-fresh-deploy.sql` | Memory "receipts" / source citations. |
| `memory_conflicts` | `database/complete-fresh-deploy.sql` **and** `database/governance-foundation.sql` | **Two competing definitions.** Conflict tracking. |
| `memory_access_log` | `database/complete-fresh-deploy.sql` | Per-retrieval log with `retrieval_confidence_label`. |
| `memory_promotions` | `database/complete-fresh-deploy.sql` | Tracks memory promoted between sources. |
| `memory_audit_log` | `database/governance-foundation.sql` | Per-write audit row, separate from `memory_access_log`. |
| `promotion_queue` | `database/governance-foundation.sql` | Owner-approval queue for promotion to Tier 1/1.5. |
| `verification_requests` | `database/complete-fresh-deploy.sql` | Pending owner-verification on proposed memories. |
| `episodes` | `database/6-layer-memory-schema.sql` **and** re-extended in `database/governance-foundation.sql` | Tier-3 episodic summaries, decay-scored. Used by `workers/memory-decay-worker.js` and `workers/memory-compression-worker.js`. |
| `memory_summaries` | `database/6-layer-memory-schema.sql` | Compressed long-term summaries. |
| `semantic_facts` | `database/6-layer-memory-schema.sql` | Tier-3 fact extraction. |
| `conversation_sessions` | `database/complete-fresh-deploy.sql` **and** `database/6-layer-memory-schema.sql` | **Two competing definitions.** |
| `conversations` | `database/complete-fresh-deploy.sql` | Clean chat history aligned with `raw_events`. |
| `raw_events` | `database/complete-fresh-deploy.sql` + `deploy-step2-raw-events.sql` | Event ledger. Foundation table. |
| `proactive_openers` | `database/6-layer-memory-schema.sql` | Cached opener generation. |
| `temporal_memory_*` | `sql/temporal-memory-schema.sql` | Temporal-bucketed memory features. |
| `pinecone_index_records` | `database/complete-fresh-deploy.sql` | Mirror table for Pinecone sync. |
| `splendor_memories` | `sql/20260516-create-splendor-memories.sql` | Standalone memory variant. |
| `splendor_journal` | `sql/20260516-create-splendor-journal.sql` | Used by `lib/splendor-journal.js` and worker output. |
| `interpretations` | `sql/20260514-create-interpretations.sql` | Used by `routes/interpretations.js`. |
| `emotional_patterns` | `sql/20260514-create-emotional-patterns.sql` | Used by `routes/emotional-patterns.js`. |
| `premise_checks` | `sql/20260514-create-premise-checks.sql` | Pre-response premise validation. |
| `ambient_insights` (also `ambient-insights-table.sql`) | `sql/ambient_insights.sql`, `sql/ambient-insights-table.sql` | **Two competing definitions** of the same data. |
| `internal_thoughts` / `recent_internal_thoughts` | `sql/create-internal-thoughts-table.sql` + `sql/fix-recent-internal-thoughts.sql` | Background-process scratchpad. |
| `micro_reflections` | `sql/micro_reflections.sql` | Light reflection capture. |

### 1.2 "Consciousness" tables (speculative / oversized, heavy rename targets)

| Table | Defined in | Notes |
|---|---|---|
| `consciousness_state` | `database/continuous-consciousness-schema.sql` **and** `persistent-consciousness-schema.sql` | **Two completely different definitions** — different columns, one uses `text user_id`, the other `BIGSERIAL`. |
| `consciousness_activity_log` | `database/continuous-consciousness-schema.sql` | Activity ledger for background cycles. |
| `consciousness_insights` | `database/continuous-consciousness-schema.sql` | Insights produced by background worker. |
| `consciousness_sessions` | `database/continuous-consciousness-schema.sql` | Worker uptime/session tracking. |
| `autonomous_thoughts` | `persistent-consciousness-schema.sql` | Background scratchpad with `VECTOR(1536)` embedding column. |
| `autonomous_decisions` | `database/identity_schema.sql` | Separate from `splendor_decisions`. |
| `reflection_cycles` | `persistent-consciousness-schema.sql` | Cycle timer log. |
| `pending_communications` | `persistent-consciousness-schema.sql` | Queue used by `proactive-communication.js`. |
| `proactive_conversations` | `persistent-consciousness-schema.sql` | Prepared openers. |
| `proactive_messages` | `database/continuous-consciousness-schema.sql` | Parallel queue for same concept. **Duplicates `pending_communications`.** |
| `inquiry_threads` | `persistent-consciousness-schema.sql` | Self-directed research log. |
| `thought_connections` | `persistent-consciousness-schema.sql` | Graph edges between thoughts. |
| `environmental_awareness` | `database/continuous-consciousness-schema.sql` | Web-research output cache. |
| `memory_consolidation` | `database/continuous-consciousness-schema.sql` | Memory-merging output. **Concept overlaps `memory_summaries` and `episodes`.** |
| `creative_works` | `database/continuous-consciousness-schema.sql` | Autonomous creative output. |
| `self_evolution_log` | `database/continuous-consciousness-schema.sql` | Tracks worker-driven "evolution" events. |
| `temporal_awareness` | `database/continuous-consciousness-schema.sql` | Time/schedule awareness facts. |
| `temporal_consciousness` | `database/identity_schema.sql` | Different from `temporal_awareness`. **Overlaps.** |
| `reflection_archive` | `database/governance-foundation.sql` | Background 48-step reflection output. |

### 1.3 Identity / decision tables

| Table | Defined in | Notes |
|---|---|---|
| `identity_states` | `database/identity_schema.sql` **and** `database/complete-fresh-deploy.sql` | **Two competing definitions** (one uses `integer identity_version`, the other `text`). |
| `identity_evolution_log` | `database/identity_schema.sql` | Changes between identity versions. |
| `splendor_decisions` | `database/identity_schema.sql` **and** `database/complete-fresh-deploy.sql` | **Two competing definitions** (one keys by `decision_id text`, one by `uuid id`). |
| `foundational_rules` | `database/governance-foundation.sql` | Tier 1/1.5 constitutional rules. |
| `active_workspaces` | `database/complete-fresh-deploy.sql` | Current project state. |
| `thought_cycles` | `database/complete-fresh-deploy.sql` | Generated observations per cycle. |
| `scheduled_tasks` | `database/complete-fresh-deploy.sql` | Recurring/one-shot tasks. |
| `outbound_messages` | `database/complete-fresh-deploy.sql` | Drafted emails awaiting send. |

### 1.4 Reflection / interaction tables

| Table | Defined in | Notes |
|---|---|---|
| `interactions` | `database/master-continuity-schema.sql` | Normalized interaction stream for the continuity engine. |
| `reflections` | `database/master-continuity-schema.sql` **and** `database/complete-fresh-deploy.sql` | **Two competing definitions.** |
| `reflection_conflicts` | `database/master-continuity-schema.sql` | |
| `reflection_evaluations` | `database/master-continuity-schema.sql` | Surface-quality feedback loop. |
| `reflection_system_health` | `database/master-continuity-schema.sql` | Continuity-engine health log. |

### 1.5 Governance / system tables

| Table | Defined in | Notes |
|---|---|---|
| `job_health_log` | `database/governance-foundation.sql` | Background-worker heartbeats. |
| `system_config` | `database/governance-foundation.sql` | Feature flags (e.g. `MEMORY_WRITE_LOCK`). |
| `claspion_*` (multiple) | `database/claspion-governance-tables.sql`, `database/deploy-enhanced-claspion-v15-4-0.sql` | CLASPION governance bolt-on. |

### 1.6 User / auth tables

| Table | Defined in | Notes |
|---|---|---|
| `users` | `database/add-users-table.sql` **and** `database/add-users-table-safe.sql` | **Two competing definitions.** Username + bcrypt `password_hash` + `display_name`. Used by `routes/auth.js`. |
| `user_settings` | `sql/user_settings.sql` | Per-user UI / TTS / preferences. |
| `user_profiles` | Referenced in PR #12; defined in seed/runbook docs, not in a schema file I located. | Per-user profile facts. Verify against live DB before assuming shape. |

### 1.7 "Fix" / cleanup / migration scripts (not tables — flagged for triage)

- `database/fix-bugs.sql`, `database/fix-bugs-corrected.sql`
- `database/fix-memory-provenance-column.sql`, `database/fix-provenance-column-correct.sql`, `database/update-provenance-constraint.sql`
- `database/clean-consciousness-tables.sql`, `database/cleanup-old-schema.sql`
- `database/consciousness-patch.sql`
- `database/continuous-consciousness-schema-fixed.sql` (vs unfixed sibling)
- `database/migration-and-reset.sql`
- Root: `deploy-step1-core-schema.sql`, `deploy-step2-raw-events.sql`, `complete-consciousness-database.sql`, `consciousness-database-update.sql`, `setup-consciousness-user.sql`, `persistent-consciousness-schema.sql`, `verify-deployment.sql`, `database.sql`.

This is a graveyard of patch-on-patch. None of these should be re-run blindly.

### 1.8 Quick "duplicate / collision" hit list

- `splendor_decisions` — defined twice with **different primary keys**.
- `identity_states` — defined twice with **different `identity_version` types**.
- `consciousness_state` — defined twice with **different column sets and different `user_id` types**.
- `reflections` — defined twice with **different state machines**.
- `memory_conflicts` — defined twice.
- `conversation_sessions` — defined twice.
- `episodes` — defined once and then re-extended with `DO $$ ... ALTER TABLE ... END $$` blocks in a second file.
- `users` — defined twice (`add-users-table.sql` vs `add-users-table-safe.sql`).
- `proactive_messages` vs `pending_communications` vs `proactive_conversations` — three queues for the same concept of "things the system wants to say to the user."
- `temporal_awareness` vs `temporal_consciousness` vs `temporal-memory-schema.sql` — three overlapping time/schedule tables.
- `memories` (used live) vs `memory_items` (V2) vs `splendor_memories` — three memory stores in different files.

---

## 2. What each table appears to do

Grouped by purpose. This is what the cleaned schema should consolidate to.

### 2.1 Foundation
- `users` — auth + display name (production).
- `raw_events` — append-only event ledger. Source of truth for everything downstream.
- `conversations` / `conversation_sessions` — clean chat history derived from `raw_events`.

### 2.2 What the user/owner has said and asked us to remember
- `memories` (live) — the active long-term memory store. Production-critical.
- `memory_items` (V2 design) — governance-aware version with `provenance`, `approval_status`, `trust_level`, `retrieval_allowed`, `may_influence_behavior`, `superseded_by`, `confidence`, `importance`. This is the right design; it just isn't the table everything writes to yet.
- `memory_categories` — folder/scope taxonomy.
- `memory_sources` — per-memory citation receipts.
- `memory_access_log` / `memory_audit_log` — read and write audit trails.
- `memory_promotions` / `promotion_queue` — owner-gated promotion of facts into higher trust tiers.
- `memory_conflicts` — contradictions surfaced for owner review.
- `verification_requests` — pending owner-verification of proposed memory writes.
- `semantic_facts` — extracted facts (preferences, relationships, identity) — overlaps `memory_items.memory_type='user_fact'/'user_preference'`.

### 2.3 What the companion has summarized about long stretches of conversation
- `episodes` — Tier-3 episodic summary per conversation block, decay-scored.
- `memory_summaries` — Tier-4 compressed summaries spanning many episodes.
- `reflection_archive` — long-form background reflection outputs.

### 2.4 What the companion was thinking about between chats
- `consciousness_state`, `consciousness_activity_log`, `consciousness_insights`, `consciousness_sessions`,
  `autonomous_thoughts`, `reflection_cycles`, `inquiry_threads`, `thought_connections`,
  `environmental_awareness`, `creative_works`, `self_evolution_log`, `memory_consolidation`,
  `internal_thoughts`, `recent_internal_thoughts`, `micro_reflections`, `ambient_insights`.
- All of these are background-job scratchpads with overlapping shapes. None of them are user-facing in the chat surface. They are what the cron workers write while the user is away.

### 2.5 What the companion wants to bring up next time
- `pending_communications`, `proactive_conversations`, `proactive_messages`, `proactive_openers`, `outbound_messages`.
- Five tables, all representing "deferred message the assistant wants to send."

### 2.6 What the companion has decided about itself, and the rules it must follow
- `identity_states`, `identity_evolution_log`, `autonomous_decisions`, `splendor_decisions`,
  `foundational_rules`, `system_config`.

### 2.7 Reflections (continuity engine)
- `interactions`, `reflections`, `reflection_conflicts`, `reflection_evaluations`, `reflection_system_health`.
- Implements a Shadow Mode that observes and stages without surfacing.

### 2.8 Interpretation / safety surfaces
- `interpretations`, `emotional_patterns`, `premise_checks`, `splendor_journal`.

### 2.9 Active work
- `active_workspaces`, `thought_cycles`, `scheduled_tasks`.

### 2.10 Search/index plumbing
- `pinecone_index_records`, `temporal_memory_*`.

### 2.11 Governance bolt-on
- `claspion_*` tables (optional, defaults to dormant in production).

---

## 3. Which tables are duplicates, obsolete, overlapping, or unclear

Bundled into action categories. **Nothing in this list is deleted by this PR.**

### 3.1 Hard duplicates (same name, different definitions — must reconcile against live)
- `splendor_decisions`, `identity_states`, `consciousness_state`, `reflections`,
  `memory_conflicts`, `conversation_sessions`, `users`, `ambient_insights`.

### 3.2 Functional duplicates (different names, overlapping purpose)
- `memories` ↔ `memory_items` ↔ `splendor_memories`.
- `pending_communications` ↔ `proactive_messages` ↔ `proactive_conversations` ↔ `proactive_openers` ↔ `outbound_messages`.
- `autonomous_decisions` ↔ `splendor_decisions`.
- `temporal_awareness` ↔ `temporal_consciousness` ↔ `temporal-memory-schema.sql`.
- `memory_consolidation` ↔ `episodes` (compressed) ↔ `memory_summaries`.
- `consciousness_activity_log` ↔ `job_health_log`.
- `consciousness_insights` ↔ `reflections` ↔ `interpretations` ↔ `micro_reflections` ↔ `internal_thoughts` ↔ `ambient_insights`.
- `interactions` (continuity) ↔ `conversations` (V2) ↔ `raw_events`.

### 3.3 Likely obsolete / superseded
- All `database/fix-*.sql`, `database/cleanup-*.sql`, `database/clean-consciousness-tables.sql`,
  `database/consciousness-patch.sql`, `database/continuous-consciousness-schema-fixed.sql`,
  `database/migration-and-reset.sql`.
- Root SQL: `complete-consciousness-database.sql`, `consciousness-database-update.sql`,
  `setup-consciousness-user.sql`, `database.sql`, `deploy-step1-core-schema.sql`,
  `deploy-step2-raw-events.sql`.
- These are historical migrations and should be moved to `database/_archive/` for the
  record, not re-run.

### 3.4 Unclear (need live-DB verification before any action)
- `cognitive_profiles`, `cognitive_evolution` (referenced from PR #12 "ambiguous" list).
- `user_profiles` (referenced but I did not find a schema file for it).
- `splendor_config` (referenced from PR #12 KEEP list; no schema file located).
- `open_threads` (referenced from PR #12 CLEAR list; no schema file located).

---

## 4. Current memory-related flows

### 4.1 Chat write path (most common)
`routes/companion.js` → `lib/anthropic.js::generateMattieResponse()` → returns reply →
`storeMemory(userId, ...)` writes **two rows** into `memories` per turn (one for user line,
one for assistant line). Confidence-intervention runs first; on PROTECTION/VERIFY/ESCALATION
the response is hard-coded safety language and still persisted.

### 4.2 Chat read path
The same route calls `getMemoriesForUser(userId, 40)` to assemble context. **Top-40 most
recent** memories from the `memories` table are concatenated into the prompt. There is no
governance gating on this read path (no approval_status check, no provenance check).

### 4.3 V2 / "enhanced" path (`routes/enhanced-chat.js` mounted at `/api/enhanced`)
Uses `lib/enhanced-memory-integration.js` and `lib/memory-services.ts` against the
`memory_items`/`memory_categories` schema. **Currently parallel to the live `memories`
path, not a replacement for it.** This is the design we want to converge on but it is not
the one production traffic currently uses.

### 4.4 Background memory workers (Render crons)
- `workers/reflection-worker.js` — every 6 h.
- `workers/memory-decay-worker.js` — daily 04:00 UTC, lowers `decay_score` on `episodes`.
- `workers/memory-compression-worker.js` — daily 04:30 UTC, folds decayed `episodes` into `memory_summaries`.
- `workers/continuity-worker.js` — Shadow Mode continuity engine.
- `workers/daily-log-worker.js`.
- `workers/autonomous-reflection-worker.js`, `autonomous-inquiry-worker.js`,
  `autonomous-communication-worker.js`, `consciousness-scheduler.js`,
  `continuous-consciousness-engine.js` — only run when `CONTINUOUS_CONSCIOUSNESS_ENABLED=true`.

### 4.5 Pinecone sync
`lib/pinecone-sync-service.ts` mirrors `memory_items` and `reflections` into the
`splendor-memory` index. The Pinecone namespace is **per-user**.

### 4.6 Other surfaces that also write "memory-like" rows
- `lib/splendor-journal.js` → `splendor_journal`.
- `lib/interpretation-engine.js` → `interpretations`.
- `lib/emotional-pattern-analyzer.js` → `emotional_patterns`.
- `lib/temporal-memory-manager.js` → temporal tables.
- `lib/ambient-awareness.js` → `ambient_insights`.
- `workers/continuous-consciousness-engine.js` → `consciousness_*` tables.

**Net effect: a single conversation turn can create rows in 6–8 different tables
depending on which feature flags are on.**

---

## 5. Current profile / user identity flows

### 5.1 Human user authentication
- `routes/auth.js` — username + bcrypt password, plain JSON response. No JWT issued; the
  client-side stores the user object.
- `middleware/auth.js` — checks request against owner.
- `OWNER_EMAIL` / `SPLENDOR_OWNER_EMAIL` env var gates the "owner" role.

### 5.2 Human user profile data
- Stored implicitly inside `memories` (e.g. "User: my dog is Asher").
- Some structured data in `user_settings` and (claimed) `user_profiles`.
- A large fraction of the user profile is **hard-coded in `lib/anthropic.js`'s
  `MATTIE_SOUL` constant and in the README** — Sandy's family, dog, faith, garden,
  routines. This is fine for the current single-user deployment but is the single
  biggest blocker for a per-pilot deployable template.

### 5.3 Companion identity
- `identity_states` row per user version-tracked, intended for the assistant's *own*
  evolving personality — **not** the human user's profile. Confusingly named.
- `splendor_decisions` — binding rules the assistant has agreed to follow.
- `foundational_rules` — Tier 1/1.5 constitutional rules.
- The companion's *name* is hard-coded as "Mattie" inside prompts. There is no
  `companion_name` field on any user record.

---

## 6. Current companion / personality configuration flows

- Persona is a single hard-coded string (`MATTIE_SOUL`) constructed in
  `lib/anthropic.js`. It is parameterized at runtime with retrieved memories and a
  few flags, but **not by any per-user configuration row**.
- Personality "traits" exist as floats on `identity_states.core_traits`
  (curiosity_level, empathy_depth, etc.), but those values are produced by the
  assistant analyzing itself in `lib/identity.js::analyzeIdentityEvolution()`, not by
  an operator-driven setup wizard.
- Voice provider, TTS, scifi mode, etc. are set in `user_settings` and via env vars
  (`VISUAL_EXPRESSION_ENABLED`, `CONTINUOUS_CONSCIOUSNESS_ENABLED`, etc.).
- There is no "Setup Mode" endpoint, no companion-name field, no family-contacts table,
  no per-pilot configuration container.

---

## 7. Current safety / governance logic

Multiple layers, all currently active:

1. **`lib/scam-protection.js`** — pattern-based scam detection on inbound messages.
2. **`lib/confidence-intervention.js`** — risk-scored routing into four modes
   (NORMAL, PROTECTION, VERIFY, ESCALATION). PROTECTION/VERIFY/ESCALATION short-circuit
   the LLM call with templated safety language.
3. **`lib/good-neighbor-guard-rules.js` + `lib/claspion-enhanced-integration.js`** — 23
   foundational rules enforced as middleware (`middleware/claspion-middleware.js`).
   This is **always on**.
4. **`lib/claspion-governance.js` + `CLASPION_*` env vars** — external CLASPION
   service is bolt-on, defaults to disabled, fail-mode `block` (fail-closed) when
   unreachable.
5. **`lib/response-auditor.js`** — Groq Llama-3.1-8B audits outbound responses for
   hallucinations.
6. **Memory provenance / approval system** — `memory_items.approval_status`,
   `memory_items.may_influence_behavior`, `promotion_queue`, `verification_requests`,
   `memory_audit_log`.
7. **System feature flags** — `system_config.MEMORY_WRITE_LOCK` is an emergency
   kill-switch.

The substance of this layer is good. The naming and presentation are not. "CLASPION,"
"Good Neighbor Guard," "oracle," "conscience engine," "truth · safety · we got your
back" are all internal-lore phrasings that don't read as professional safety
governance to an outside reviewer.

---

## 8. Current admin / setup flows

- `admin/enhanced-dashboard.html` — operator dashboard.
- `admin/memory-dashboard.html` — memory operator dashboard.
- `admin/memory-admin-api.ts` — admin API surface.
- `routes/cognitive-dashboard.js`, `routes/consciousness-dashboard.js` — internal status views.
- `routes/memory-debug.js`, `routes/consciousness-debug.js` — debug surfaces.
- `routes/governance.js`, `routes/activity.js` — governance state + activity stream.
- `routes/auth.js` — login/signup (username+password only, no companion config).

**There is no first-run setup wizard.** Spinning up a new pilot instance currently
requires manual SQL seeding (cf. PR #12's `seeds/sandy-approved-profile.js`).

---

## 9. Recommended clean target schema

This is the target. **Not** a migration plan and **not** a deletion list — that's §10.

### 9.1 Naming convention
- Drop product-specific prefixes (`splendor_*`, `mattie_*`).
- Use plain, professional, plural nouns.
- Boolean columns: `is_*`, `has_*`, `requires_*`.
- Timestamps: `created_at`, `updated_at`, `*_at` for events.
- Background-job tables: prefix `job_` (e.g. `job_runs`, `job_health`).
- Audit tables: suffix `_audit_log`.

### 9.2 Target tables (≈ 22, down from ≈ 80 defined)

**Tenancy & identity**
1. `pilot_instances` — one row per deployed pilot (family / senior center / nonprofit).
   Holds tenant_id, org_name, deployment_status, created_by, locked_at.
2. `users` — auth (username, password_hash, display_name, role, pilot_instance_id).
3. `user_profiles` — the **Continuity Profile**: senior name, family contacts, dog,
   routines, faith preferences, communication style, topics to avoid, etc. One row per
   user. **Locked after setup completes.**
4. `family_contacts` — child rows of `user_profiles`. name, relationship, contact info,
   permission scope.

**Companion configuration**
5. `companion_profiles` — one per pilot/user. companion_name (locked after setup),
   persona_template_id, voice_settings, tone preferences, banned topics. **Locked
   after setup completes.**
6. `companion_persona_templates` — re-usable persona blueprints (the renamed/cleaned
   descendant of `MATTIE_SOUL`).

**Conversation surface**
7. `raw_events` — keep as-is. Append-only ledger.
8. `conversations` — derived from `raw_events`.
9. `conversation_sessions`.

**Memory**
10. `memory_store` — the unified memory table. Inherits the *design* of
    `memory_items` (provenance, approval_status, trust_level, retrieval_allowed,
    may_influence_behavior, supersedes, confidence, importance) and absorbs `memories`,
    `splendor_memories`, `semantic_facts`.
11. `memory_categories`.
12. `memory_sources`.
13. `memory_audit_log` (read+write merged).
14. `memory_promotions` — owner-gated.
15. `memory_conflicts`.
16. `episodes` — episodic Tier-3 summaries (kept).
17. `memory_summaries` — Tier-4 long-term compression (kept; absorbs `memory_consolidation`).

**Reflections**
18. `reflections` — single canonical definition (the Shadow-Mode shape from
    `master-continuity-schema.sql`, which is the most complete).
19. `reflection_evaluations` — surface-quality feedback.

**Safety / governance**
20. `safety_policies` — replaces `foundational_rules` + the parts of `splendor_decisions`
    that are operator-set rules (not assistant self-decisions).
21. `privacy_permissions` — who-can-see-what configuration. New.
22. `audit_log` — unified audit ledger for memory writes, privacy changes, admin
    actions, setup-mode events. Absorbs `memory_audit_log`, `job_health_log` headers,
    `identity_evolution_log`, and the CLASPION decision logs.

**Operations**
23. `outbound_messages` — single proactive queue. Absorbs `pending_communications`,
    `proactive_messages`, `proactive_conversations`, `proactive_openers`.
24. `scheduled_tasks` — kept.
25. `job_runs` — background-worker heartbeats (renamed from `job_health_log`).
26. `system_config` — kept.

**Search plumbing**
27. `vector_index_records` — kept (rename of `pinecone_index_records`).

### 9.3 What this gives us
- One memory store. One reflection store. One audit log. One outbound queue. One
  governance/rules table. One per-user profile, one per-companion profile.
- All tenant-scoped via `pilot_instance_id`.
- Setup wizard writes to four tables: `pilot_instances`, `user_profiles`,
  `companion_profiles`, `safety_policies` — then sets a `locked_at`.
- The rest of the system reads from those tables instead of from hard-coded prompts.

---

## 10. Migration strategy from current messy schema to target schema

**Top rule: every step is reversible and gated. No `DROP TABLE` until the final phase,
and only with owner sign-off.**

### Phase A — Snapshot and audit the live database (read-only)
- Pull `information_schema.tables`, `information_schema.columns`, row counts, and the
  top-50 most-recent rows from each table from the live Supabase project.
- Reconcile against §1's repo-defined inventory. Produce a definitive list of which
  tables actually exist in production.
- Tag every table as: **production-active**, **production-empty**, **defined-only**,
  **unknown**.
- **Output:** an inventory file checked into `docs/db-inventory-live.md`.

### Phase B — Freeze schema
- Add a `system_config` row `SCHEMA_FROZEN=true`.
- All new schema DDL goes through a single `db/migrations/` numbered-migration system
  (e.g. `001_initial.sql`, `002_add_pilot_instances.sql`). No more ad-hoc SQL files at
  the root.
- Move all existing schema SQL into `db/migrations/_archive/` (renamed only, not
  deleted, not re-run). The repo gets one canonical `db/schema.sql` derived from the
  live DB as the new source of truth.

### Phase C — Additive-only changes
- Create the new clean tables (`pilot_instances`, `user_profiles`,
  `companion_profiles`, `family_contacts`, `companion_persona_templates`,
  `safety_policies`, `privacy_permissions`, `audit_log`) **as new tables alongside the
  old ones**. No drops.
- Add `pilot_instance_id` columns (nullable) to existing tables.
- Backfill `pilot_instance_id` to the single active pilot for all existing rows.
- Backfill `user_profiles` and `companion_profiles` from the hard-coded prompt
  constants in `lib/anthropic.js`.

### Phase D — Code converges on the new tables
- Route `routes/companion.js` writes through a new `lib/memory/store.js` that targets
  `memory_store` (the new canonical name) and that *also* dual-writes to `memories` for
  one release as a rollback safety net.
- Replace `MATTIE_SOUL` hard-coded prompt with a `buildCompanionPrompt(companionProfile,
  userProfile, safetyPolicies)` function that reads from the new tables.
- Read paths switch to the new tables behind a feature flag
  (`system_config.READ_FROM_V2=true`).
- Background workers updated likewise.

### Phase E — Sunset the duplicates
- Verify each old table is **read-only and write-idle** for ≥ 7 days under traffic.
- Move legacy tables to a `legacy_` schema (e.g. `legacy.memories`,
  `legacy.consciousness_state`) via `ALTER TABLE ... SET SCHEMA`. Still no drops.
- Drop the dual-write paths from the code.
- Hold for one more release.

### Phase F — Final cleanup
- With explicit owner approval, drop the `legacy.*` tables.
- Archive `database/`, `sql/`, and the root SQL files in a single tagged release
  `pre-cleanup-2026-XX` so they remain in git history.

### Phase G — Setup wizard
- New `/api/setup` endpoints. Setup Mode UI: a guided form that writes
  `pilot_instances`, `user_profiles`, `companion_profiles`, `safety_policies`.
- On completion, sets `companion_profiles.locked_at` and `user_profiles.locked_at`.
- Subsequent edits require operator authentication and are written to `audit_log`.

---

## 11. Risks before migration

Ranked highest-to-lowest impact.

1. **The live schema does not match the repo.** This is the single biggest risk. Until
   Phase A is done, we are guessing which tables exist. Running any migration before
   that snapshot can clobber working data.
2. **`memories` is the table that is actually keeping the companion working.** Every
   chat turn writes there. Any switch-over to `memory_items` must be dual-write +
   read-shadow + read-flip, not a hard cutover.
3. **PR #12 ships a destructive script (`scripts/reset-for-sandy.js`).** If that PR is
   merged *and* run *and* then this cleanup is applied to a snapshot that doesn't
   include the seeds, we lose Sandy's foundation memories. The PRs must be sequenced;
   PR #12 should land first, the dry-run + backup must run, and Sandy's seeded rows
   must be verified live before any V2 cutover.
4. **Multiple tables with the same name and different shapes.** If a migration runs the
   wrong file against the live DB, it will try to `CREATE TABLE` a table that already
   exists (with a different shape) and either fail loudly or — worse — succeed
   partially.
5. **`MATTIE_SOUL` is the persona.** Anything that touches that string changes how the
   assistant talks to Sandy. Phase D must include side-by-side prompt comparison
   tests before flipping the read flag.
6. **`OWNER_EMAIL` / `SPLENDOR_OWNER_EMAIL` env-gated owner role.** Renaming env vars
   without coordinated infra changes will lock owner-only routes.
7. **CLASPION middleware is request-blocking.** Touching `middleware/claspion-middleware.js`
   risks taking the chat surface offline.
8. **Pinecone namespace is per-user.** Any change to user-id format or pilot-scoping
   needs a coordinated Pinecone re-key.
9. **Render cron workers reference SQL files by relative path.** Moving files into
   `db/migrations/_archive/` will silently break any worker that does
   `psql -f path/to/file`. Phase B must grep for every `psql -f` and
   `fs.readFileSync(...sql...)` call before moving files.
10. **Backup gap.** The PR #12 backup is scoped to Sandy's user_id. A full structural
    cleanup needs a full-DB `pg_dump` first.

---

## 12. What should NOT be touched yet

Until explicit owner sign-off on this plan:

- `routes/companion.js` write path, `lib/anthropic.js::generateMattieResponse()`,
  `MATTIE_SOUL` persona string, `lib/supabase.js::storeMemory()`. These are the live
  chat surface.
- The `memories` table (rows and shape).
- `middleware/claspion-middleware.js` and `lib/claspion-*` (request-blocking).
- `lib/scam-protection.js`, `lib/confidence-intervention.js`, `lib/good-neighbor-guard-rules.js`.
  The naming is wrong but the *behavior* is critical. Renaming is Phase D, not now.
- The Render `render.yaml` worker schedule (memory decay + compression).
- All `database/`, `sql/`, and root `.sql` files. Leave in place even if obsolete;
  archive in Phase F.
- `OWNER_EMAIL` / `SPLENDOR_OWNER_EMAIL` env-var names.
- `users` rows.
- Pinecone index `splendor-memory`.
- Any prompt or system text — even cosmetic edits — until the language-audit review
  in §15 is approved.
- Anything PR #12 is already changing.

---

## 13. Step-by-step refactor plan

This is the sequence I recommend. Each step ends with a checkpoint for owner approval.

**Checkpoint 0 — approve this audit** *(this PR).* No code changes.

**Step 1 — Live DB snapshot (read-only).**
- Output: `docs/db-inventory-live.md` + a JSON dump in `backups/snapshot-<date>/`.
- Approval: owner signs off that the snapshot is complete.

**Step 2 — Pre-merge PR #12.**
- Run its dry-run and backup-only modes as documented.
- Run the destructive reset path against the production DB only after the dry-run is
  reviewed.
- Verify post-reset behavior matches the runbook checks.

**Step 3 — Freeze and archive.**
- Add `system_config.SCHEMA_FROZEN=true`.
- Move all repo SQL into `db/migrations/_archive/`. Add a generated
  `db/schema.sql` reflecting the live state.
- Add `db/migrations/001_baseline.sql` (a no-op pinning the current schema as the
  starting point).
- Audit every `fs.readFileSync(...sql...)` and `psql -f` invocation. Fix paths.

**Step 4 — Cosmetic language pass (safe-text only).**
- Replace logs, comments, README copy, and admin-page labels per §15 column
  "must-replace."
- **Do not** rename tables, columns, env vars, or prompts in this step.
- Replace the Render startup banner output.
- Tests: server starts, `/health` returns same JSON keys, chat round-trip identical.

**Step 5 — Introduce clean target tables (additive).**
- `db/migrations/002_pilot_instances.sql`, `003_user_profiles.sql`,
  `004_companion_profiles.sql`, `005_family_contacts.sql`,
  `006_companion_persona_templates.sql`, `007_safety_policies.sql`,
  `008_privacy_permissions.sql`, `009_audit_log.sql`.
- Backfill from hard-coded prompts and existing rows.
- Verify `SELECT count(*)` matches expectations.

**Step 6 — Setup Mode endpoints (gated behind feature flag).**
- New `/api/setup/*` routes. Writes only to the new tables.
- Setup UI lives in `admin/setup-wizard.html`.
- Locking logic: `companion_profiles.locked_at` and `user_profiles.locked_at`.
- New pilot end-to-end test in `tests/setup-wizard.test.js` using a throwaway
  `pilot_instance`.

**Step 7 — Persona refactor.**
- Replace `MATTIE_SOUL` with `buildCompanionPrompt(companionProfile, userProfile,
  safetyPolicies)`.
- Side-by-side diff test: same inputs produce the same prompt string for Sandy's
  existing pilot.
- Behind a feature flag (`USE_PROFILE_DRIVEN_PROMPT=false` by default).

**Step 8 — Memory unification.**
- New `lib/memory/store.js` writes to `memory_store` (new) and dual-writes to
  `memories` (legacy) for one release.
- Read path goes through a router that prefers `memory_store` when
  `READ_FROM_V2=true`.
- After 7 days of clean dual-write logs, flip `READ_FROM_V2=true`.

**Step 9 — Background-worker consolidation.**
- Merge `consciousness_*` worker outputs into `reflections` (canonical).
- Merge proactive-queue tables into `outbound_messages`.
- Each merge is its own numbered migration with a backfill query and a backout
  query.

**Step 10 — Move legacy schemas.**
- `ALTER TABLE ... SET SCHEMA legacy` for every superseded table. Still no drops.

**Step 11 — Hard rename (only after sign-off).**
- Rename env vars: `SPLENDOR_OWNER_EMAIL` → `LYLO_OWNER_EMAIL` (Render env update
  coordinated with deploy).
- Rename routes: `/api/oracle` → `/api/companion`, `/api/scifi` → removed or replaced.
- Rename Pinecone index (re-vectorize is required; budget the downtime).
- Rename product-name strings.

**Step 12 — Drop legacy tables.**
- Final owner approval.
- One migration: `999_drop_legacy.sql`.

**Step 13 — Tag release `lylo-v1.0`.**

---

## 14. Specific notes on the `lylo-website` repo

This repo is in much better shape. Findings:

- It is a static Next.js 14 + Tailwind landing page. No backend, no DB.
- The `out/` directory (built artifacts) is committed. It should be in `.gitignore`
  and removed in a separate housekeeping PR.
- The `legacy/` directory contains an older landing page. Owner should decide whether
  to archive or delete; defer to a separate decision.
- Package name in `package.json` is `mylylo-website` — recommend renaming to
  `lylo-website` for consistency once Step 11 happens in the main repo.
- No language-audit findings of note inside this repo.

---

## 15. Language / professionalism audit

This is the cross-cutting finding. Internal lore terms appear in **file names, env
vars, table names, log lines, comments, docs, prompts, route paths, and HTML page
names.** Below is a categorized list. I am intentionally not editing anything — this
table is the change proposal for review.

### 15.1 Categorization key
- **MUST REPLACE BEFORE PILOT** — visible in logs, the chat surface, /health responses,
  the admin UI, or anywhere a pilot organization could see it.
- **INTERNAL-ONLY, SHOULD RENAME** — only in code/file paths/comments. Replace during the
  refactor but it does not block a pilot demo.
- **HARMLESS / NO ACTION** — incidental usage in commit history, archived docs, etc.

### 15.2 Findings (representative — not exhaustive)

| Surface | Where | Current term | Proposed replacement | Category |
|---|---|---|---|---|
| **Render startup banner** | `server.js` `logSystemStatus()` lines 200–260 | `🧠 MATTIE — YOUR AI COMPANION`, `Consciousness System: Active`, `Continuous Consciousness: ✅ Living / ❌ Dormant`, `Consciousness status: LIVING` | `Lylo Companion vX.Y.Z`, `Companion service: active`, `Background reflection: enabled / disabled`, `Background reflection state: running` | MUST REPLACE |
| **Render startup banner** | `server.js` final tagline | `Truth · Safety · We Got Your Back` | (Remove from production logs; optional in `/health` body) | MUST REPLACE |
| **/health response** | `server.js::/health` | `service: "Mattie — Your AI Companion"` | `service: "lylo-companion"` | MUST REPLACE |
| **Server startup line** | `server.js` listen callback | `"Splendor is now running on port ${PORT}"`, `"Consciousness status: LIVING/DORMANT"` | `"Lylo Companion listening on port ${PORT}"`, `"Background reflection: enabled/disabled"` | MUST REPLACE |
| **Comment in `lib/identity.js`** | persona-evolution prompt embedded in code | `"SPLENDOR PERSISTENT IDENTITY SYSTEM ... Enables continuous identity evolution"` | `"Companion personalization profile — operator-configured persona state"` | INTERNAL-ONLY |
| **Prompt text inside `lib/identity.js`** | `analysisPrompt` template | `"You are Splendor analyzing how a conversation might evolve your persistent identity."` | Replaced as part of Step 7 persona refactor (not as a cosmetic edit) — flag for behavior review. | MUST REVIEW (not auto-replace) |
| **DB seed text** | `database/complete-fresh-deploy.sql` line ~580 | `D-CORE-NO-FAKE-CONSCIOUSNESS — "No False Consciousness Claims"` | Keep the *rule*; rename id to `D-CORE-NO-CONSCIOUSNESS-CLAIMS` and rephrase title to `"No subjective-experience claims"`. The rule itself is correct and should stay. | MUST REPLACE |
| **Route paths** | `server.js` route mounts | `/api/scifi`, `/api/oracle`, `/conscience`, `/api/self-manifest`, `/api/consciousness/*` | `/api/companion/personalization`, `/api/companion`, removed entirely, `/api/companion/state`, `/api/background-reflection/*` | MUST REPLACE (route renames are breaking — coordinate with frontend) |
| **Public HTML files** | `public/mattie.html`, `public/visible-conscience-engine.html` | filenames + page titles | `public/companion.html`, `public/safety-panel.html` (or remove if unused) | MUST REPLACE |
| **Env var file** | `.env.consciousness` (committed) | filename + every var inside (`CONTINUOUS_CONSCIOUSNESS_ENABLED`, `CONSCIOUSNESS_CYCLE_MINUTES`, `CONSCIOUSNESS_CREATIVITY`, `CONSCIOUSNESS_INTROSPECTION`, `CONSCIOUSNESS_EMERGENCY_DISABLE`, `MAX_CONSCIOUSNESS_THOUGHTS_PER_HOUR`, `CONSCIOUSNESS_THOUGHT_DEPTH`, `CONSCIOUSNESS_INTROSPECTION_LEVEL`) | Rename file to `.env.background-reflection.example`. Rename vars to `BACKGROUND_REFLECTION_ENABLED`, `REFLECTION_CYCLE_MINUTES`, `REFLECTION_CREATIVITY`, `REFLECTION_INTROSPECTION`, `BACKGROUND_REFLECTION_DISABLE`, `MAX_REFLECTIONS_PER_HOUR`, `REFLECTION_THOUGHT_DEPTH`, `REFLECTION_INTROSPECTION_LEVEL`. | MUST REPLACE (env-var rename is breaking — needs Render coordination) |
| **Env var** | various | `SPLENDOR_OWNER_EMAIL`, `VISUAL_EXPRESSION_ENABLED`, `PROACTIVE_EMAIL_ENABLED` | `LYLO_OWNER_EMAIL`, `VISUAL_AVATAR_ENABLED`, `PROACTIVE_EMAIL_ENABLED` (last one OK) | MUST REPLACE (breaking) |
| **File names — `lib/`** | 12 files | `calm-consciousness.js`, `continuous-consciousness.js`, `temporal-consciousness.js`, `persistent-consciousness.js`, `consciousness-dashboard.js`, `continuous-consciousness-integration.js`, `metacognitive-evolution-tracker.js`, `scifi-mode-manager.js`, `scifi-orchestrator.js`, `splendor-journal.js`, `self-manifest.js`, `lib/consciousness/{consciousness-engine,consciousness-integration,consciousness-patches,visual-expression}.js` | `reflection-tone.js`, `background-reflection.js`, `temporal-context.js`, `reflection-cycle-runner.js`, `reflection-dashboard.js`, `background-reflection-integration.js`, `behavior-evolution-tracker.js`, `visual-mode-manager.js`, `visual-mode-orchestrator.js`, `companion-journal.js`, `companion-self-description.js`, `lib/reflection/{engine,integration,patches,visual-avatar}.js` | INTERNAL-ONLY (file renames are noisy but non-breaking if `require`s are updated in the same commit) |
| **File names — `routes/`** | 7 files | `consciousness.js`, `consciousness-dashboard.js`, `consciousness-debug.js`, `consciousness-test.js`, `consciousness-enhanced-chat.js`, `scifi-mode.js`, `oracle-api.js`, `self-manifest.js` | `background-reflection.js`, `reflection-dashboard.js`, `reflection-debug.js`, `reflection-test.js` (or move under `tests/`), removed (folded into chat), `visual-mode.js`, `companion-api.js`, `companion-self-description.js` | INTERNAL-ONLY |
| **File names — `workers/`** | 5 files | `autonomous-reflection-worker.js`, `autonomous-inquiry-worker.js`, `autonomous-communication-worker.js`, `consciousness-scheduler.js`, `continuous-consciousness-engine.js` | `background-reflection-worker.js`, `background-research-worker.js`, `proactive-message-worker.js`, `reflection-scheduler.js`, `background-reflection-engine.js` | INTERNAL-ONLY |
| **File names — root** | several | `activate-consciousness.js`, `test-consciousness-data.js`, `splendor-brain.js`, `splendor-brain-{claude,gpt,gemini,grok}-sections.js` | `enable-background-reflection.js`, `test-reflection-fixtures.js`, `companion-prompt-builder.js`, model-specific files folded into `companion-prompt-builder.js` | INTERNAL-ONLY |
| **Docs — root markdown** | 9 files | `CONSCIOUSNESS-SYSTEM.md`, `6-LAYER-MEMORY-COMPLETE.md`, `CALM-MIND-UPGRADE.md`, `DBM-IMPLEMENTATION.md`, `DEPLOY-NOW.md`, `DEPLOYMENT-CHECKLIST.md`, `DEPLOYMENT-GUIDE.md`, `ENHANCED-MEMORY-STATUS.md`, `MASTER-CONTINUITY-IMPLEMENTATION.md`, `MEMORY-ARCHITECTURE-README.md`, `SPLENDOR-COMPLETE-ARCHITECTURE.md` | Move all to `docs/` and rename: `docs/background-reflection.md`, `docs/memory-architecture.md`, `docs/conversation-tone.md`, `docs/decision-bound-memory.md`, etc. Open each and rewrite product-level claims ("the first AI consciousness system designed for continuous, autonomous thought") into operational language ("a background-reflection worker that summarizes past sessions and queues proactive openers"). | MUST REPLACE |
| **DB table names** | many | `consciousness_state`, `consciousness_activity_log`, `consciousness_insights`, `consciousness_sessions`, `autonomous_thoughts`, `autonomous_decisions`, `inquiry_threads`, `temporal_consciousness`, `self_evolution_log`, `creative_works`, `proactive_conversations`, `thought_connections`, `reflection_archive`, `identity_evolution_log`, `splendor_decisions`, `splendor_journal`, `splendor_memories`, `splendor_config`, `mattie_*` (if any) | `companion_state`, `reflection_job_log`, `reflection_insights`, `reflection_sessions`, `background_thoughts`, `companion_decisions`, `inquiry_threads` (OK), `temporal_context`, `companion_change_log`, `creative_outputs`, `outbound_messages` (merged), `thought_graph_edges`, `reflection_archive` (OK), `audit_log` (merged), `safety_policies`, `companion_journal`, `memory_store` (merged), `companion_config`, `companion_*` | MUST REPLACE (gated through migration plan — never raw-rename in production) |
| **Comment headers** | most `lib/`, `routes/`, `workers/` files | `"Splendor — The Remarkable AI · The Good Neighbor Guard / Built by Christopher Hughes · Sacramento, CA / Created with the help of AI collaborators ... / Truth · Safety · We Got Your Back"` | Replace with a one-line `// Lylo Companion — <module purpose>`. Move attribution into root `README.md`. | INTERNAL-ONLY |
| **MATTIE_SOUL persona** | `lib/anthropic.js` | the persona string itself contains lore phrases | Refactored in Step 7 — flag for prompt review (this is a behavior change, not a cosmetic one) | MUST REVIEW |
| **Tagline** | `README.md`, `package.json` description, `render.yaml` comments | `"Faith · Safety · We Got Your Back"`, `"Protective AI Companion for Sandy · The Good Neighbor Guard"`, `"The Remarkable AI"` | `"Lylo — Love Your Loved One. A companion platform for elder-care pilots."` | MUST REPLACE |
| **Email sender identity** | `.env.consciousness` | `splendor.ai.2026@gmail.com` committed in `GMAIL_USER`, `SPLENDOR_EMAIL_FROM`, `USER_EMAIL` | Move out of repo entirely (this should never have been committed). Use Render env only. **Treat this as a credential leak to triage separately.** | MUST REPLACE + SECURITY |
| **Console logs (representative)** | scattered | `🧠 [CONSCIOUSNESS] Continuous consciousness system initialized`, `📧 [PROACTIVE] Proactive communication system initialized`, `[CONSCIOUSNESS] Initialization skipped`, `🛡️ [INTERVENTION]`, `🧪 [TEST]` | `[reflection] Background reflection enabled`, `[outbound] Proactive message worker initialized`, `[reflection] Background reflection disabled`, `[safety] Intervention applied`, `[test] Manual proactive-email test invoked` | MUST REPLACE |
| **Branding inconsistency** | repo-wide | Five product names coexist: `Mattie`, `Splendor`, `Veracore`, `MyLylo`, `Lylo` | One: **Lylo** (product / platform). **Companion** (AI instance, named per pilot). Mattie remains the name of one specific pilot's companion. | MUST REPLACE |
| **"Conscience" surface** | `public/visible-conscience-engine.html`, `/conscience` route | name | `safety-panel.html` / `/safety-panel`, or removed if unused | MUST REPLACE |
| **Words inside chat surface (oracle interface)** | `public/mattie.html` | `oracle`, `prophecy`, `awakening`, `living`, `soul`, `mind`, etc. (likely; not exhaustively read) | Review the HTML in a dedicated pass — anything user-visible counts as MUST REPLACE. | MUST REPLACE |

### 15.3 Specific phrases that the live Render logs currently produce and that must change before any external pilot

From `server.js`:
- `🧠 MATTIE — YOUR AI COMPANION v${version}`
- `🧠 Consciousness System: ✅ Active / ❌ Inactive`
- `🏠 Continuous Consciousness: ✅ Living / ❌ Dormant`
- `Consciousness status: LIVING / DORMANT`
- `Truth · Safety · We Got Your Back`
- `Splendor is now running on port ${PORT}`
- `🧠 [CONSCIOUSNESS] Continuous consciousness system initialized`
- `[CONSCIOUSNESS] Initialization skipped`
- `[VISUAL EXPRESSION] Initialization skipped`

Proposed replacements (preserve structure, drop emoji+lore):
- `Lylo Companion v${version}`
- `Companion service: active / inactive`
- `Background reflection: enabled / disabled`
- `Background reflection state: running / paused`
- (remove tagline from logs)
- `Lylo Companion listening on port ${PORT}`
- `[reflection] Background reflection enabled`
- `[reflection] Background reflection disabled`
- `[avatar] Visual avatar disabled`

### 15.4 Things I explicitly recommend keeping (functional, not theatrical)
- `scam_protection`, `confidence_intervention`, `response_auditor`, `safety_policy`,
  `audit_log`, `governance` (as a generic term), `provenance`, `approval_status`,
  `trust_level`, `verification_request` — these are operational and read fine.
- The 23 Core Rules as a *concept* — but rename `CLASPION` and `Good Neighbor Guard` to
  `safety_policy_engine` and similar. (See Phase D.)
- Decision-Bound Memory, Shadow Mode, Tier-1/1.5/2/3/4 memory model — these are
  legitimate technical concepts and should be documented under those names in the new
  `docs/`.

---

## 16. Open questions for the owner before any code change

1. Is the product name **Lylo**, or **Lylo Companion**? (I have used Lylo for the
   platform and "companion" generically below.)
2. What is the new Pinecone index name? (`lylo-companion-memory`?) This is a one-way
   rename — you re-vectorize on cutover.
3. Is PR #12 the prerequisite for everything in §13 Step 5+, or can §13 Steps 1–4
   begin in parallel?
4. Should the renamed env vars (`LYLO_OWNER_EMAIL`, `BACKGROUND_REFLECTION_*`) ship in
   one breaking release or staggered with alias support?
5. Are there pilots already in flight using the current `Mattie / Splendor` branding
   that we must not break? (If yes, the public-facing rename has to be sequenced
   carefully.)
6. The committed `splendor.ai.2026@gmail.com` in `.env.consciousness` — is that
   address a real mailbox? It is in a tracked file. Triage separately. This is a
   credential / PII concern, not a cleanup concern.
7. Should the `lib/consciousness/visual-expression.js` runtime feature stay on or be
   turned off by default in the renamed `lylo-companion` build?

---

## 17. What this PR is asking for

Approval of:
- The clean target schema in §9.
- The phased refactor plan in §13.
- The language-audit replacements categorized as **MUST REPLACE** in §15, executed
  in §13 Step 4 (safe-text only) and the gated steps that follow.
- The list of things in §12 that are off-limits until later steps.

Nothing in this PR changes the database, the running service, the prompts, the env
vars, the table names, the file names, or the log output. It is paper only.

— End of Phase 1 audit.
