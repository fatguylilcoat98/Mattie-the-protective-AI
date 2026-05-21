# Lylo architecture docs

This directory holds the system-level architecture documentation:
schema, data flows, system map, and the historical architecture docs
that used to live at the repo root.

## What lives here (target state)

- `system-map.md` - one diagram + paragraph per box, suitable for an
  outside engineer or reviewer.
- `schema-target.md` - the clean target schema (~22 tables) and the
  rationale for each.
- `data-flows.md` - the read/write paths for the chat surface, the
  background workers, the setup wizard, the legacy archive, and the
  exports.
- `sql-reference-audit.md` - every reference to a `.sql` file in the
  codebase, with the proposed new path. The blocking audit for PR
  A2 (file moves).
- Historical architecture docs (e.g. `MEMORY-ARCHITECTURE-README.md`,
  `MASTER-CONTINUITY-IMPLEMENTATION.md`) moved here from the repo
  root in PR A2.

## What does NOT live here

- Security documents - those live in `docs/security/`.
- Privacy / visibility docs - those live in `docs/privacy/`.
- Pilot onboarding and runbooks - those live in `docs/pilot/` and
  `docs/readiness/`.
- Audit reports and Phase 1 planning docs - those currently live in
  the repo's `docs/` root from earlier PRs and may move into a
  `docs/audit/` directory in a later doc-rewrite pass.
