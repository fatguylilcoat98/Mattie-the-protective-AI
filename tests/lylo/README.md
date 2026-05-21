# Lylo — Privacy & RLS matrix tests (synthetic schema)

**Owner:** project lead. **Reviewer:** owner.

This suite is the **binding RLS / privacy contract** that PR E will
implement against the live database. Every policy, trigger, and
constraint in `fixtures/synthetic-schema.sql` mirrors the production
shape PR E ships. If the live policies diverge from this contract,
the live policies are wrong.

No production DB connection. The harness refuses to run if
`SYNTHETIC_DATABASE_URL` looks like production.

## What it tests

| File | What |
|---|---|
| `rls-matrix.test.js` | Core role × visibility matrix from the privacy model doc §5.1. Includes the system-role compose-context carve-out and the family default-deny invariant. |
| `cross-pilot-isolation.test.js` | A senior of pilot A cannot see pilot B rows. Family, caregiver, admin all confirmed. Spoofed pilot scope cannot escalate. |
| `insert-update-restrictions.test.js` | Senior can insert / update their own rows. Family / caregiver / admin / system cannot. |
| `audit-forgery.test.js` | Audit-log INSERT requires `actor_user_id = current_session_user_id()` and `actor_role = current_session_role()`. Admin cannot forge as senior. |
| `audit-append-only.test.js` | UPDATE and DELETE on the audit log are silently filtered to 0 rows for every role. |
| `vault-lockout.test.js` | 5 failed PIN attempts triggers lockout; 6th session insert is refused by trigger. Successful unlock resets counter. |
| `rls-content-immunity.test.js` | Memory content containing prompt-injection or SQL-injection payloads does not change RLS evaluation. |
| `inheritance.test.js` | Derived rows (episodes, summaries, reflection_archive) inherit the most restrictive source visibility. `outbound_messages` for private content must be addressed to the owning senior. |
| `visibility-change-audit.test.js` | Every `visibility_level` change writes a `visibility_changed` audit row. Same-value updates do not write. Senior can see audit rows about their own memories. |
| `senior-sees-own-only.test.js` | Senior's unqualified `SELECT` returns only their own active rows in their own pilot. |
| `no-fabrication.test.js` | (Scaffolded; filled in by PR F's response auditor work.) |

## How to run

The suite needs a throwaway Postgres. Easiest is Docker:

```sh
docker run --rm -d --name lylo-test-pg -p 55432:5432 \
  -e POSTGRES_PASSWORD=test postgres:15
export SYNTHETIC_DATABASE_URL='postgres://postgres:test@localhost:55432/postgres'
node --test tests/lylo/
docker stop lylo-test-pg
```

The harness lazily `require()`s `pg`; if it is not installed, tests
skip with a clear message. We intentionally do not add `pg` to the
project's `package.json` in this PR.

## Production-DB guard

`fixtures/test-harness.js` refuses to connect if
`SYNTHETIC_DATABASE_URL`:

- contains `supabase.co`, `supabase.io`, `render.com`, `onrender.com`,
  `rds.amazonaws.com`, `azure.com`, `gcp.cloudsql`, `production`,
  `prod-`
- contains a user fragment matching production roles
  (`supabase_admin`, `service_role`, `authenticator`, `postgres@`)
- overlaps with the host portion of a set `SUPABASE_URL`
- does not point at localhost / 127.0.0.1 / ::1 / `host.docker.internal`

The guard is intentionally conservative. If it false-positives on
your local URL, fix the URL; do not edit the guard.

## Session context (GUCs the suite reads)

| GUC | Set by | Purpose |
|---|---|---|
| `app.user_role` | `withRole(client, who, fn)` | one of `senior`, `family`, `caregiver`, `admin`, `system`, `seeder` |
| `app.user_id` | same | the requesting user's UUID |
| `app.pilot_instance_id` | same | the pilot scope; every policy filters on it |
| `app.compose_target_user_id` | `withRole(..., { composeTargetUserId })` | the optional carve-out for the `system` role to read a senior's `private` memory while composing a senior-addressed outbound message |
| `app.visibility_change_reason` | same | optional free-text picked up by the visibility-change audit trigger |

## Production divergence to expect

Production (PR E) will use **real Postgres roles** with
`SET LOCAL session_authorization` and the same policy `USING` clauses
keyed on GUCs that the auth middleware sets. The synthetic suite uses
a single superuser connection with `FORCE ROW LEVEL SECURITY` on every
table so the policies fire against the GUC values directly. The policy
logic is the same; the plumbing differs by one `SET LOCAL` flavor.

## What scaffolded tests still cover

`no-fabrication.test.js` is scaffolded because the no-fabrication
guard ships with PR F. The other previously-scaffolded test files
(`cross-pilot-isolation`, `inheritance`, `audit-append-only`) are
now live and asserting real behavior against the hardened schema.

## Mapping to the privacy model

| Test file | Privacy model section |
|---|---|
| `rls-matrix.test.js` | §5.1 reads & writes access matrix |
| `cross-pilot-isolation.test.js` | (tenant scoping; cross-cuts §5) |
| `insert-update-restrictions.test.js` | §5.2 writes |
| `audit-forgery.test.js` | §3.4 + §5 |
| `audit-append-only.test.js` | §3.4 append-only invariant |
| `vault-lockout.test.js` | §2.3 + §3.2 + §9 |
| `rls-content-immunity.test.js` | §5.1 (content is data, not control) |
| `inheritance.test.js` | §3.6 |
| `visibility-change-audit.test.js` | §4.3 |
| `senior-sees-own-only.test.js` | §5.1 senior row |

— End of Lylo test-suite README.
