# Lylo privacy docs

Memory visibility model, audit policy, retention, and the
user-facing privacy posture for a Lylo pilot.

## What lives here (target state)

- `memory-privacy-model.md` - the three-tier visibility model
  (`private`, `family_shared`, `password_locked`). Currently lives
  at `docs/lylo-memory-privacy-model.md` on the audit branch (PR
  #13); will move here in a later cleanup pass.
- `visibility-audit-policy.md` - what gets logged, who can read the
  log, what the retention is, and how the append-only invariant is
  enforced.
- `retention-policy.md` - per-memory-type retention, soft-delete
  semantics, hard-delete semantics, vault-row retention,
  audit-log retention (7 years).
- `family-and-caregiver-permissions.md` - the
  `family_contacts.permission_scope` schema, what each scope means,
  how the senior controls who sees what.

## What does NOT live here

- Threat model and incident response - those live in
  `docs/security/`.
- The schema migrations that implement these policies - those live
  in `db/migrations/`.
