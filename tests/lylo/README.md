# Lylo — Privacy & RLS matrix tests (synthetic schema)

**Owner:** project lead. **Reviewer:** owner.

This suite exercises the visibility model and RLS policies from
`docs/lylo-memory-privacy-model.md` (PR #13) against a **synthetic
Postgres**. It does not connect to production. It is the test
bed that PR E (RLS enforcement, execution plan §11) depends on.

## What it tests

1. **`rls-matrix.test.js`** — the role × visibility matrix from
   the privacy model doc §5.1. Every combination of
   `{senior, family, caregiver, admin, system}` against memories
   at each visibility level. The expected outcome is taken
   verbatim from §5.1.

2. **`no-fabrication.test.js`** (scaffolded) — adversarial
   tests for the no-fabrication rule. Ships filled-in by PR F.

3. **`inheritance.test.js`** (scaffolded) — derived rows
   (`episodes`, `memory_summaries`) inherit the most restrictive
   source visibility. Ships filled-in by PR D + PR E.

4. **`audit-append-only.test.js`** (scaffolded) — every role's
   attempt to `UPDATE` or `DELETE` from
   `memory_visibility_audit_log` fails. Ships filled-in by PR E.

5. **`cross-pilot-isolation.test.js`** (scaffolded) — a
   `senior` session for pilot A cannot read any row scoped to
   pilot B. Ships filled-in by PR E + PR G.

## What it does NOT do

- **Does not connect to production.** The harness refuses to
  run if `SYNTHETIC_DATABASE_URL` looks like production.
- **Does not run any migration against a live database.**
- **Does not modify any production code.** Every file lives
  under `tests/lylo/`.
- **Does not change `package.json`.** Run directly via
  `node --test`. An npm-script entry will be added in a later
  PR if desired.

## How to run

The suite needs a throwaway Postgres. Easiest is Docker:

```sh
# Start a throwaway Postgres on a non-default port.
docker run --rm -d --name lylo-test-pg -p 55432:5432 \
  -e POSTGRES_PASSWORD=test postgres:15

# Point the harness at it.
export SYNTHETIC_DATABASE_URL='postgres://postgres:test@localhost:55432/postgres'

# Run all Lylo tests.
node --test tests/lylo/

# Or run a single file.
node --test tests/lylo/rls-matrix.test.js

# Tear down.
docker stop lylo-test-pg
```

If you skip the env var, the suite **skips** rather than
falling back to any other connection string.

## Production-DB guard

Before connecting, `fixtures/test-harness.js` refuses to run if
`SYNTHETIC_DATABASE_URL`:

- contains `supabase.co`
- contains `render.com`
- equals or is a substring of `process.env.SUPABASE_URL` (when
  the production env var is also set on the same shell)
- has a username matching production roles
  (`supabase_admin`, `service_role`, `postgres` on a remote
  host, etc. — see the regex in the harness for the full list)

The guard's regex is intentionally conservative. If it false-
positives on your local URL, fix the URL; do not edit the
guard.

## Mapping to the privacy model

| Test file | Privacy model section |
|---|---|
| `rls-matrix.test.js` | §5.1 — reads & writes access matrix |
| `no-fabrication.test.js` | §7.1 + §7.5 — companion UX rules |
| `inheritance.test.js` | §3.6 — derived-row inheritance |
| `audit-append-only.test.js` | §3.4 — audit-log invariant |
| `cross-pilot-isolation.test.js` | (companion: tenant scoping) |

## How this maps to PR E rollout

PR E (execution plan §11) ships the production RLS migrations
(`030_db_roles.sql` ... `037_admin_redacted_view.sql`) and a
7-day shadow period before the `RLS_ENFORCED=true` flag flips.
The migrations in `fixtures/synthetic-schema.sql` are the
*synthetic* equivalent; they intentionally mirror the shape PR
E will ship so that the same tests will pass against the live
schema once PR E lands. Differences between the synthetic and
production shapes will be diff'd in PR E's description.

## What you can do without running the harness

Read the test files. The intent and the assertions are
declarative. Even without running the suite, the file shape
documents the contract PR E must satisfy.

— End of Lylo test-suite README.
