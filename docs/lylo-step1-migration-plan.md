# Lylo — Step 1 Migration Plan (Additive-Only, Paper Only)

**Status:** Paper plan only. **No SQL has been executed, no schema has
changed, no files have moved.** This document is the concrete, owner-gated
execution plan for Step 1 of §13 of `docs/lylo-phase1-audit.md`. It is
additive-only — nothing is dropped, renamed, or migrated. The end-state of
Step 1 is that the *repo* knows what the *live database* actually looks
like, and is ready to receive additive migrations safely.

---

## What Step 1 is and is not

**Step 1 is:**

- Capture a read-only snapshot of the live Supabase schema and row counts.
- Reconcile that snapshot against the SQL files currently in the repo.
- Establish a single `db/migrations/` numbered-migration directory.
- Move (not delete, not edit) the existing scattered SQL files into
  `db/migrations/_archive/` so they are no longer a confusing source of
  truth.
- Generate a canonical `db/schema.sql` reflecting the live DB.
- Add a `001_baseline.sql` migration that is a no-op pinning the current
  state.
- Audit every `psql -f` and `fs.readFileSync(.../*.sql)` reference in the
  repo to make sure moving files into `_archive/` does not break workers,
  scripts, or scheduled jobs.

**Step 1 is NOT:**

- Any `DROP`, `ALTER`, `RENAME`, `TRUNCATE`, or `DELETE`.
- Any data migration.
- Any application-code change beyond adjusting file paths if Step 1f
  (path audit) finds something needs updating.
- Any change to env vars, prompts, routes, or worker schedules.

**Owner sign-off gate:** Step 1 will only execute after the credential
triage actions chosen by the owner (see
`docs/lylo-credential-triage.md`) are resolved, *and* PR #12 has been
merged and verified, *and* the owner explicitly approves this Step 1 plan.

---

## Step 1a — Live DB read-only snapshot

**Goal:** know exactly which tables exist in production, in what shape,
with what row counts.

**Execution (read-only):**

1. Connect to the live Supabase DB using a **read-only** Postgres user.
   If no read-only user exists, create one in advance:
   ```sql
   -- Run as a database superuser, ONCE.
   CREATE ROLE lylo_audit_ro LOGIN PASSWORD '<rotate-after-audit>';
   GRANT CONNECT ON DATABASE postgres TO lylo_audit_ro;
   GRANT USAGE ON SCHEMA public TO lylo_audit_ro;
   GRANT SELECT ON ALL TABLES IN SCHEMA public TO lylo_audit_ro;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT SELECT ON TABLES TO lylo_audit_ro;
   ```
   The owner runs this. Claude does not get the password.

2. Run the read-only snapshot queries, capturing output to
   `docs/db-inventory-live.md` and a JSON dump under
   `backups/snapshot-<YYYY-MM-DD>/`:

   ```sql
   -- Tables and approximate row counts.
   SELECT
     n.nspname            AS schema_name,
     c.relname            AS table_name,
     c.reltuples::bigint  AS approx_rows,
     pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
   FROM pg_class c
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r'
     AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
   ORDER BY n.nspname, c.relname;

   -- Columns and types.
   SELECT table_schema, table_name, column_name, data_type,
          is_nullable, column_default
   FROM information_schema.columns
   WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
   ORDER BY table_schema, table_name, ordinal_position;

   -- Constraints (primary keys, foreign keys, unique, check).
   SELECT n.nspname AS schema_name,
          c.relname AS table_name,
          con.conname AS constraint_name,
          con.contype AS constraint_type,
          pg_get_constraintdef(con.oid) AS definition
   FROM pg_constraint con
   JOIN pg_class c ON c.oid = con.conrelid
   JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
   ORDER BY n.nspname, c.relname, con.conname;

   -- Indexes.
   SELECT schemaname, tablename, indexname, indexdef
   FROM pg_indexes
   WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
   ORDER BY schemaname, tablename, indexname;

   -- RLS policies.
   SELECT schemaname, tablename, policyname, permissive,
          roles, cmd, qual, with_check
   FROM pg_policies
   ORDER BY schemaname, tablename, policyname;

   -- Triggers.
   SELECT event_object_schema AS schema_name,
          event_object_table AS table_name,
          trigger_name, action_timing, event_manipulation,
          action_statement
   FROM information_schema.triggers
   WHERE trigger_schema NOT IN ('pg_catalog', 'information_schema')
   ORDER BY event_object_schema, event_object_table, trigger_name;

   -- Views.
   SELECT table_schema, table_name, view_definition
   FROM information_schema.views
   WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
   ORDER BY table_schema, table_name;

   -- Functions and procedures.
   SELECT n.nspname AS schema_name,
          p.proname AS function_name,
          pg_get_function_identity_arguments(p.oid) AS args,
          pg_get_function_result(p.oid) AS returns
   FROM pg_proc p
   JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
   ORDER BY n.nspname, p.proname;

   -- Sequences.
   SELECT sequence_schema, sequence_name, data_type, start_value,
          minimum_value, maximum_value, increment, last_value
   FROM information_schema.sequences
   LEFT JOIN pg_sequences
          ON pg_sequences.schemaname = sequence_schema
         AND pg_sequences.sequencename = sequence_name
   WHERE sequence_schema NOT IN ('pg_catalog', 'information_schema')
   ORDER BY sequence_schema, sequence_name;

   -- Extensions.
   SELECT name, default_version, installed_version, comment
   FROM pg_available_extensions
   WHERE installed_version IS NOT NULL
   ORDER BY name;
   ```

3. Output goes into:
   - `docs/db-inventory-live.md` — human-readable summary tables.
   - `backups/snapshot-<YYYY-MM-DD>/schema.json` — machine-readable.
   - `backups/snapshot-<YYYY-MM-DD>/schema.sql` — `pg_dump --schema-only`
     output (run by the owner against the production DB; Claude never sees
     credentials).

**Acceptance:** owner reviews `docs/db-inventory-live.md` and confirms it
matches what they expect to be in production.

---

## Step 1b — Reconcile snapshot against the repo

**Goal:** produce a definitive disposition for every SQL file currently in
the repo: was it ever applied? does it match the live state? is it dead?

**Inputs:**

- `docs/db-inventory-live.md` from Step 1a.
- The 38 SQL files in the repo (counted in the Phase 1 audit):
  - 25 in `database/`
  - 13 in `sql/`
  - Plus root-level: `database.sql`, `complete-consciousness-database.sql`,
    `consciousness-database-update.sql`, `deploy-step1-core-schema.sql`,
    `deploy-step2-raw-events.sql`, `persistent-consciousness-schema.sql`,
    `setup-consciousness-user.sql`, `verify-deployment.sql`.

**Process:**

For each SQL file, tag with one of:

- **APPLIED-MATCHES** — every `CREATE TABLE` / `CREATE INDEX` / `CREATE
  POLICY` etc. in this file exists in live with matching definition.
- **APPLIED-DRIFTED** — partially applied; live definition differs. Each
  drift is logged with the specific column/constraint difference.
- **NOT-APPLIED** — the objects defined do not exist in live.
- **SUPERSEDED** — objects exist but the file is older than another file
  defining the same objects.
- **AMBIGUOUS** — cannot tell without owner input.

**Output:** `docs/db-file-disposition.md` — a single table listing all 38+
SQL files with their tag and a one-sentence rationale.

---

## Step 1c — Establish the new migration directory layout

**Goal:** stop the bleed of ad-hoc SQL files. Make `db/migrations/` the
only place new schema work lands.

**Layout (created by Step 1c, no files moved yet):**

```
db/
  schema.sql                  # canonical generated dump of live, read-only.
  migrations/
    001_baseline.sql          # no-op; documents the live baseline state.
    README.md                 # rules for adding migrations.
    _archive/                 # destination for Step 1d. Created empty here.
```

`db/migrations/README.md` content (proposed):

```markdown
# Lylo migrations

- One file per migration, numbered (`002_add_pilot_instances.sql`).
- Additive-first. No `DROP TABLE`, `DROP COLUMN`, or destructive `ALTER`
  without explicit owner sign-off recorded in the migration's header.
- Every migration file starts with a `-- Plan: <one paragraph>` comment.
- Every migration that adds a backfill includes its rollback SQL inline,
  commented, after the migration body.
- Never run a migration that has not been reviewed by the owner.
- The `_archive/` directory contains pre-cleanup SQL that is no longer
  executed. Do not run anything from `_archive/`. It is read-only history.
```

`db/migrations/001_baseline.sql` content (proposed):

```sql
-- Plan: no-op baseline. Documents that as of <date>, the live database
-- matches db/schema.sql, and from this point forward all schema changes
-- go through db/migrations/.
--
-- This file is intentionally empty of DDL.
SELECT 1 AS baseline_recorded;
```

**Acceptance:** owner reviews and approves the layout and the
`README.md` policy text.

---

## Step 1d — Path audit (BLOCKING) before moving any file

**Goal:** make sure that moving files into `db/migrations/_archive/` does
not break anything that runs in production.

**Search and review every reference to these SQL files in the codebase:**

```bash
# Worker scripts and node code:
rg -n 'readFileSync.*\.sql' --type js
rg -n "require\('.*\.sql'\)" --type js
rg -n 'psql\b.*\.sql' .
rg -n 'supabase\b.*\.sql' .

# Package.json scripts:
rg -n '\.sql' package.json

# Render.yaml and other CI/CD:
rg -n '\.sql' render.yaml *.yml *.yaml
```

**Known references from the Phase 1 audit:**

- `package.json::scripts.setup:consciousness`:
  `psql $DATABASE_URL -f persistent-consciousness-schema.sql`
- `package.json::scripts.continuity:setup`:
  `psql $SUPABASE_URL -f database/master-continuity-schema.sql`
- `package.json::scripts.memory:deploy`:
  reads `database/complete-fresh-deploy.sql`
- Possibly more in worker code (`workers/*.js`) and `scripts/*.js`.

**Output:** `docs/sql-reference-audit.md` — a list of every code reference
to a `.sql` file, with the proposed new path under `db/migrations/_archive/`.

**Owner gate:** owner approves the rewrite before any reference is changed.

---

## Step 1e — Move-only file relocation (no edits, no deletes)

**Goal:** consolidate every scattered SQL file under
`db/migrations/_archive/` so the working tree has one place for SQL.

**Procedure:**

1. For each file tagged in Step 1b, move it (via `git mv`) into
   `db/migrations/_archive/<original-subdir>/<filename>`.
   - Example:
     `database/master-continuity-schema.sql` →
     `db/migrations/_archive/database/master-continuity-schema.sql`.
   - `git mv` preserves history. No `git rm` + `git add`.
2. Simultaneously, update every reference identified in Step 1d to point
   to the new path.
3. Verify with a dry-run of the relevant npm scripts that they at least
   resolve to readable paths (not that they execute against the DB):
   ```bash
   npm run setup:consciousness -- --dry-run  # if supported
   # or just:
   cat "$(npm run setup:consciousness --silent --print-cmd 2>/dev/null || true)" \
     || ls -la db/migrations/_archive/persistent-consciousness-schema.sql
   ```
4. Commit with message: `chore(db): relocate scattered SQL to db/migrations/_archive/ (move-only, no edits)`.

**Acceptance:**

- `git log --follow` on every moved file shows pre-move history.
- A grep for `.sql` in non-`db/` paths returns only test fixtures (if any).
- A `npm install && npm test` run (where tests exist) passes.

---

## Step 1f — Schema freeze flag

**Goal:** make it explicit that ad-hoc DDL is no longer allowed.

**Execution (owner runs in Supabase SQL editor, after Steps 1a–1e):**

```sql
-- Insert (or update) a row in system_config. This is additive only.
INSERT INTO system_config (config_key, config_value, config_type,
                           description, category, modified_by,
                           modification_reason, environment)
VALUES (
  'SCHEMA_FROZEN', 'true', 'boolean',
  'When true, all schema changes must go through db/migrations/. No ad-hoc DDL.',
  'governance', 'owner',
  'Step 1 schema freeze — Lylo cleanup.',
  'production'
)
ON CONFLICT (config_key) DO UPDATE SET
  config_value = 'true',
  last_modified_at = NOW(),
  modified_by = 'owner',
  modification_reason = 'Step 1 schema freeze — Lylo cleanup.';
```

This writes one row. No table is created, altered, or dropped.

**Acceptance:** `SELECT * FROM system_config WHERE config_key='SCHEMA_FROZEN'`
returns `true`.

---

## Step 1g — `db/schema.sql` regeneration

**Goal:** check in a single canonical SQL file reflecting the live state.

**Procedure (owner runs):**

```bash
# Owner runs against production, with credentials Claude never sees:
PGPASSWORD='<service-role>' pg_dump \
  --schema-only \
  --no-owner --no-privileges --no-comments \
  --schema=public \
  --file=db/schema.sql \
  "$DATABASE_URL"

# Format check (optional):
git diff db/schema.sql
```

`db/schema.sql` becomes the reference for what *is*. It is regenerated, not
hand-edited. Every future migration adds to it; reviewers diff against it.

**Acceptance:** `db/schema.sql` exists, is non-empty, and matches a fresh
`pg_dump` to the byte (modulo formatting).

---

## Step 1 acceptance checklist

Step 1 is complete when **all** of these are true:

- [ ] `docs/db-inventory-live.md` exists and the owner has confirmed it.
- [ ] `docs/db-file-disposition.md` exists with a disposition for every
      pre-existing SQL file.
- [ ] `db/migrations/` directory exists with `001_baseline.sql`,
      `README.md`, and `_archive/`.
- [ ] `docs/sql-reference-audit.md` exists and shows zero unresolved
      references to pre-move SQL paths.
- [ ] Every old SQL file lives under `db/migrations/_archive/`, moved with
      `git mv` so history is preserved.
- [ ] `package.json` scripts and any `psql -f` / `fs.readFileSync` calls
      have been updated to the new paths.
- [ ] `system_config.SCHEMA_FROZEN = true` is set in the live DB.
- [ ] `db/schema.sql` exists and reflects live.
- [ ] `npm install` succeeds and any existing tests pass.
- [ ] The running service restart after the path-reference changes does
      not regress the startup banner or `/health` response.

Once checked, Step 1 is signed off and Step 2 (introduce clean target
tables additively) is unblocked.

---

## Risks Step 1 introduces

- **Worker scripts that look up SQL by relative path will break** if Step 1d
  is skipped. Mitigation: Step 1d is blocking.
- **An undiscovered consumer of an SQL file** (e.g. a Cloudflare worker, a
  cron job outside Render, a hand-run script) may still expect the old
  path. Mitigation: post-move, watch logs for 7 days, and the
  `db/migrations/_archive/` directory keeps the files reachable at a
  predictable location.
- **`pg_dump` output differences across Postgres versions** can produce a
  noisy `db/schema.sql`. Mitigation: pin the `pg_dump` version (the one
  Supabase ships) and document it in `db/migrations/README.md`.

No data is at risk in Step 1. No row is read, written, deleted, or moved.

— End of Step 1 plan.
