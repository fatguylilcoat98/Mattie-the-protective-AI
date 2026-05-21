# Lylo migrations

All Lylo schema changes go through this directory. One file per
migration, numbered sequentially.

## Rules

- **Additive-first.** No `DROP TABLE`, `DROP COLUMN`, or destructive
  `ALTER` without explicit owner sign-off recorded in the migration's
  header comment.
- **Every migration file starts with a `-- Plan: <one paragraph>`
  comment** explaining what it does and why.
- **Every migration that adds a backfill includes its rollback SQL
  inline**, commented, after the migration body.
- **Never run a migration that has not been reviewed by the owner.**
  Migrations are reviewed in the PR that adds them, applied by the
  owner against a snapshot, and only then run against production.
- **`archive/` contains pre-cleanup SQL** that is no longer
  executed. Do not run anything from `archive/`. It is read-only
  history, kept so old commits and stack traces still resolve to
  real files.

## Layout

```
db/
  schema.sql              - canonical dump of live, regenerated, read-only
  migrations/
    001_baseline.sql      - no-op pin
    002_*.sql ... 999_*.sql
    archive/              - historical SQL, move-only, not executed
```

## Adding a migration

1. Decide on the next number. Increment from the highest existing
   filename (`002_`, `003_`, ...).
2. Name the file: `NNN_short_description.sql`.
3. Open with a `-- Plan:` comment. One paragraph. Why this exists.
4. Body: the DDL. Additive only unless the PR description has
   explicit owner sign-off for a destructive step.
5. After the body, commented out, include the rollback SQL.
6. If the migration changes a column on an existing table with rows,
   verify the rewrite is online (Supabase handles `ADD COLUMN`
   with a default; some other `ALTER`s rewrite the table — set a
   statement timeout).
7. Open the migration in a draft PR. Owner reviews. Owner applies
   against a snapshot of live. Owner applies against live only
   after the snapshot run is clean.

## What `001_baseline.sql` is

A no-op. It returns `SELECT 1` and changes nothing. It exists to
anchor the numbered chain and to document that as of the commit that
introduced it, `db/schema.sql` reflects the live database.

This is intentional. We are not attempting to recreate the live
schema from migrations. The live schema is whatever it actually is.
`db/schema.sql` is the source of truth for the baseline; migrations
in this directory are the source of truth for everything since.

## What `archive/` is

The pre-cleanup `database/`, `sql/`, and root-level `*.sql` files
are moved here (via `git mv`, in a follow-up PR) so the repo's
active surface has one place to look for SQL.

Files in `archive/` are never executed. They are kept because:

- old commits may reference them by path,
- production stack traces and Render cron logs may name them,
- they document the prototype-era schema evolution that led here.

Do not delete files from `archive/` without explicit owner approval.
