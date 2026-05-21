# SQL reference audit (blocking precursor to PR A2)

**Status:** Read-only audit. **No file has been moved or modified
by this audit.** This document inventories every reference to a
`.sql` file in the codebase so the follow-up PR (PR A2) that
actually `git mv`s the files into `db/migrations/_archive/` can
update every reference atomically in the same commit.

**Scope of the audit:** every file in the repo at
`fatguylilcoat98/mattie-the-protective-ai` HEAD of `master`
(`a7560565d63cdaa3f182c4cbda6c260faf4fefc4`).

## 1. Summary

- **5 active references** to SQL files exist in the codebase.
- All 5 references point to **3 distinct SQL files.**
- **0 references** come from `fs.readFileSync(.../*.sql)` calls
  in JavaScript code.
- **0 references** come from worker scripts, route handlers,
  `lib/` modules, or tests.
- The active references live in **2 files**: `package.json` and
  `deploy-windows.ps1`.

PR A2 (the move PR) will therefore update exactly **5 lines
across 2 files** plus perform the `git mv` operations
themselves. The move is mechanical, small, and reversible.

## 2. Active references

### 2.1 `package.json` (3 references)

From the `scripts` block on master:

```json
"setup:consciousness": "psql $DATABASE_URL -f persistent-consciousness-schema.sql",
"continuity:setup":    "psql $SUPABASE_URL -f database/master-continuity-schema.sql",
"memory:deploy":       "powershell -Command \"Get-Content 'database/complete-fresh-deploy.sql' | Write-Host\""
```

Proposed post-move paths (PR A2 will rewrite these lines):

| Script              | Current path                                  | Proposed path                                              |
|---------------------|-----------------------------------------------|------------------------------------------------------------|
| `setup:consciousness` | `persistent-consciousness-schema.sql`         | `db/migrations/_archive/root/persistent-consciousness-schema.sql` |
| `continuity:setup`    | `database/master-continuity-schema.sql`       | `db/migrations/_archive/database/master-continuity-schema.sql`    |
| `memory:deploy`       | `database/complete-fresh-deploy.sql`          | `db/migrations/_archive/database/complete-fresh-deploy.sql`       |

### 2.2 `deploy-windows.ps1` (2 references)

The Windows PowerShell deployment helper references the same
`database/complete-fresh-deploy.sql` twice:

- Line ~7: `if (Test-Path "database/complete-fresh-deploy.sql") { ... }`
- Line ~22: `psql $env:SUPABASE_URL -f database/complete-fresh-deploy.sql`
- Line ~38: `Get-Content "database/complete-fresh-deploy.sql" | Write-Host`

(Three textual occurrences of the same path; one logical
reference to one file.)

Proposed post-move path:
`db/migrations/_archive/database/complete-fresh-deploy.sql`.

## 3. Files that do NOT reference SQL paths

Verified by direct reads:

- `server.js`
- `routes/*.js` (all of them)
- `lib/*.js` (all of them, including `lib/supabase.js`,
  `lib/anthropic.js`, `lib/proactive-communication.js`)
- `middleware/*.js`
- `workers/*.js` (all of them — none read SQL from disk; they
  use the Supabase client)
- `scripts/fix-memory-provenance.js` (only one script under
  `scripts/`)
- `tests/*.js` and `tests/*.ts` (do not read SQL from disk;
  they exercise the data model via the Supabase client)
- Root-level helpers: `verify-deployment.js`,
  `deploy-memory-provenance-fix.js`, `test-consciousness-data.js`,
  `activate-consciousness.js`, `splendor-brain.js` and
  `splendor-brain-*-sections.js`
- `render.yaml` (does not reference SQL files; worker schedules
  call `node workers/*.js`)
- `package-lock.json`, `tsconfig.json`, `webpack.config.js`,
  `next.config.js` (no SQL refs)

None of these files need updating in PR A2.

## 4. Stale `package.json` script references (not blocking)

During the audit several `package.json` script entries were
identified that reference JS files that do NOT exist on master.
They are not SQL-related but flagging them here so they aren't
mistaken for live references in future audits.

Missing JS files referenced by `package.json` scripts:

- `node scripts/memory-migration.js` (from `memory:migrate`)
- `node scripts/migration-audit.js` (from `memory:audit`)
- `node seed-foundational-rules.js`
- `node setup-4tier-system.js`
- `node setup-temporal-memory.js`
- `node setup-cognitive-dashboard.js`
- `node setup-ambient-insights.js`
- `node setup-recent-internal-thoughts.js`

**Action:** none in PR A or PR A2. These are stale script
entries; cleaning them up is a separate, owner-gated cleanup PR
so the diff stays focused on file moves. Documented here so it
is not lost.

## 5. Files to be moved by PR A2

Using this audit as input, PR A2 will move:

- **`database/*.sql`** (~25 files) → `db/migrations/_archive/database/`
- **`sql/*.sql`** (~13 files) → `db/migrations/_archive/sql/`
- **Root `*.sql`** (~8 files: `database.sql`,
  `complete-consciousness-database.sql`,
  `consciousness-database-update.sql`,
  `deploy-step1-core-schema.sql`,
  `deploy-step2-raw-events.sql`,
  `persistent-consciousness-schema.sql`,
  `setup-consciousness-user.sql`, `verify-deployment.sql`)
  → `db/migrations/_archive/root/`

**Total:** roughly 46 files moved via `git mv`. Content
byte-identical; only paths change.

Alongside the moves, PR A2 will edit:

- `package.json`: rewrite the 3 lines listed in §2.1
- `deploy-windows.ps1`: rewrite the 3 textual occurrences
  listed in §2.2 (all pointing to one logical file).

No other file is modified.

## 6. Rollback for PR A2

Revert the merge commit. Because every changed file is in the
same commit (`git mv` + the 2 reference edits), reverting
restores both the file locations and the script content
atomically.

## 7. What this audit does NOT do

- Does not move any file.
- Does not modify any file.
- Does not delete any file.
- Does not run any migration.
- Does not change any behavior.

It is the read-only blocking audit that PR A2 depends on.

— End of SQL reference audit.
