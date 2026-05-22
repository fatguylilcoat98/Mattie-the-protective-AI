# Lylo — Privacy & RLS matrix tests (synthetic schema, v4 hardened)

**Owner:** project lead. **Reviewer:** owner.

This suite is the **binding RLS / privacy contract** that PR E will
implement against the live database. Every policy, trigger, function,
and constraint in `fixtures/synthetic-schema.sql` mirrors the production
shape PR E ships. If the live policies diverge from this contract, the
live policies are wrong.

No production DB connection. The harness refuses to run if
`SYNTHETIC_DATABASE_URL` looks like production.

## What it tests

| File | What |
|---|---|
| `rls-matrix.test.js` | Core role × visibility matrix; family default-deny. |
| `cross-pilot-isolation.test.js` | Senior of pilot A cannot see pilot B; spoofed scope cannot escalate. |
| `cross-pilot-orphan.test.js` | (C2) Composite FKs refuse rows whose owner/contact/user is in a different pilot. |
| `compose-context.test.js` | (C1, H7) Compose-context GUC alone is insufficient; only a granted `compose_authorizations` row + audit row enables system access to a target senior's `private` rows. Non-system roles cannot grant; cross-pilot grants refused; expired grants refused. |
| `outbound-target.test.js` | (C3, C4) Family/caregiver targets can SELECT family_shared drafts addressed to them; private/locked drafts must target the owning senior (with sources) or the session user (without sources). |
| `admin-vault-redaction.test.js` | (C5) Admin has zero direct SELECT access to `memory_vaults` and `memory_vault_sessions`. |
| `lookup-leak.test.js` | (H1, H2) `family_contacts` and `users` lookups are narrowed beyond "everyone in pilot". |
| `insert-update-restrictions.test.js` | Senior INSERT / UPDATE on own rows; family/caregiver/admin/system cannot write. (H3) Senior cannot UPDATE soft-deleted (`active = false`) rows. |
| `audit-forgery.test.js` | Audit-log INSERT requires `actor_user_id = self` and `actor_role = self`. Admin cannot forge as senior. |
| `audit-append-only.test.js` | UPDATE and DELETE on the audit log are filtered to 0 rows. |
| `vault-lockout.test.js` | (H4 + H6) 5 failed attempts trigger lockout; 6th refused; lockout revokes active sessions; success resets counter. |
| `concurrent-vault-sessions.test.js` | (M4) Multiple concurrent active vault sessions per user are allowed. |
| `rls-content-immunity.test.js` | Memory content containing injection payloads cannot change RLS evaluation. |
| `inheritance.test.js` | Derived rows inherit the most-restrictive source visibility. Outbound drafts with private/locked content must target the owning senior. |
| `inheritance-recompute.test.js` | (H5) Soft-delete or hard-delete of a source memory marks derived rows `requires_recompute = true`. |
| `visibility-change-audit.test.js` | Every visibility change writes a row; same-value updates write nothing; senior reads own-memory audit rows. (M1) Trigger fail-closes if session GUCs are missing. |
| `senior-sees-own-only.test.js` | Senior unqualified SELECT returns only their own active rows in their own pilot. |
| `caregiver-default-deny.test.js` | (M2) Caregiver with empty `permission_scope` sees zero `family_shared` rows. |
| `no-fabrication.test.js` | (Scaffolded; filled in by PR F.) |
| `role-binding.test.js` | (D2) The actor's role derives from the database role; the legacy `app.user_role` GUC has no effect. |

## How to run

```sh
docker run --rm -d --name lylo-test-pg -p 55432:5432 -e POSTGRES_PASSWORD=test postgres:15
export SYNTHETIC_DATABASE_URL='postgres://postgres:test@localhost:55432/postgres'
# --test-concurrency=1 is required: every file shares the lylo_test schema,
# so parallel files race on DROP/CREATE SCHEMA.
node --test --test-concurrency=1 tests/lylo/*.test.js
docker stop lylo-test-pg
```

## Session context

**Role — D2.** The actor's role is a real, non-superuser Postgres role
(`lylo_senior`, `lylo_family`, `lylo_caregiver`, `lylo_admin`,
`lylo_system`, `lylo_seeder`), adopted via `SET LOCAL ROLE` inside
`withRole`. The schema's `current_app_user_role()` derives the role from
`current_user`. A SQL session cannot forge `current_user` — `SET ROLE` is
privilege-checked — so the role is the unforgeable trust source. The
legacy `app.user_role` GUC has been removed; setting it has no effect on
any policy (proven by `role-binding.test.js`).

The remaining session values are GUCs, and they are **test inputs only** —
they stand in for values production derives from verified auth; they are
not the authority for the actor's role:

| GUC | Set by | Purpose |
|---|---|---|
| `app.user_id` | `withRole(client, who, fn)` | requesting user's UUID |
| `app.pilot_instance_id` | same | pilot scope; every policy filters on it |
| `app.compose_target_user_id` | `withRole(..., { composeTargetUserId })` | optional system-role compose target. **Alone insufficient — system also needs a granted `compose_authorizations` row.** |
| `app.visibility_change_reason` | `withRole(..., { visibilityChangeReason })` | optional free-text picked up by the visibility-change audit trigger |

## Production divergence to expect

After D2 the synthetic suite already binds the actor's role to a real,
non-superuser Postgres role — the same mechanism production (PR E) will
use. The harness connects once as a superuser only to apply the schema
and seed; every assertion runs after `SET ROLE` into a non-superuser
role, so RLS is genuinely enforced. A superuser connection bypasses RLS
entirely, even with `FORCE ROW LEVEL SECURITY`, so running the suite
without the `SET ROLE` step would silently make every policy a no-op.

Production must still:

- restrict who can `SET LOCAL app.compose_target_user_id` (today the
  GUC is unauthenticated; the policy gate is `compose_authorizations`,
  but a defense-in-depth grant should sit at the auth layer too);
- write a `vault_session_expired` audit row when a session expires
  past its `expires_at` (synthetic provides `expire_vault_sessions()`
  as a helper; production schedules it);
- enforce serializable / `SELECT ... FOR UPDATE` on the unlock path
  so failed-attempt counting cannot race with session creation (the
  synthetic trigger already uses `FOR UPDATE`).

## Mapping to the privacy model

| Test file | Privacy model section |
|---|---|
| `rls-matrix.test.js` | §5.1 |
| `cross-pilot-isolation.test.js` + `cross-pilot-orphan.test.js` | (tenant scoping) |
| `compose-context.test.js` | §5.1 system carve-out |
| `outbound-target.test.js` | §3.6 + outbound rules |
| `admin-vault-redaction.test.js` | §3.2 vault material |
| `lookup-leak.test.js` | (defense in depth) |
| `insert-update-restrictions.test.js` | §5.2 + retention semantics |
| `audit-forgery.test.js` + `audit-append-only.test.js` | §3.4 |
| `vault-lockout.test.js` + `concurrent-vault-sessions.test.js` | §2.3 + §3.2 |
| `rls-content-immunity.test.js` | §5.1 |
| `inheritance.test.js` + `inheritance-recompute.test.js` | §3.6 |
| `visibility-change-audit.test.js` | §4.3 + §3.4 |
| `senior-sees-own-only.test.js` | §5.1 |
| `caregiver-default-deny.test.js` | §5.1 |
| `role-binding.test.js` | (D2 — role source of truth) |

— End of Lylo test-suite README.
