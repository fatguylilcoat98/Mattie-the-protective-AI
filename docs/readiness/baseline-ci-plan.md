# Baseline CI Plan

**Status:** Draft — gate-progress
**Satisfies:** Empty Companion Shell plan (`docs/lylo/empty-companion-shell.md`) §0, gate 2 — "Baseline CI".
**Scope:** Infrastructure only — CI workflow, detect-and-report guards, and skipped test scaffolds. No code, schema, routes, prompts, migrations, Render config, or feature behavior is changed.
**Does not:** start Shell-1, or any Shell PR.

---

## Purpose

Convert governance *intent* (written in `docs/lylo/`) into governance
*violations a machine can detect*. This PR adds the CI skeleton; it does
not yet enforce everything, and it deliberately does not fix the
pre-existing debt it surfaces.

CI has two modes:

- **Report mode (current).** Guards run and surface violations. Known,
  pre-existing debt is recorded in a baseline allowlist and reported as
  a warning rather than a hard failure.
- **Enforcement mode (future).** Once the baseline is empty and the
  scaffolds are implemented, guards fail hard with zero tolerance.

---

## Workflow

A single workflow, `.github/workflows/baseline-ci.yml`, runs on every
pull request, on push to `master`, and on manual dispatch. It has six
independent jobs, and uses only the Node standard library — no
`npm install`, no network, no database.

| Job | Runner | Mode |
|---|---|---|
| Lint / format baseline | `scripts/ci/check-format.js` + `node --check` | Active (scoped) |
| Migration discovery validation | `scripts/ci/check-migrations.js` | Active (enforcing) |
| Forbidden archive execution detection | `scripts/ci/check-archive-execution.js` | Active (report + baseline) |
| RLS isolation test runner | `node --test tests/lylo/scaffold/*` | Scaffold (skipped) |
| Feature-flag-off parity | `node --test tests/lylo/feature-flag-off-parity.test.js` | Scaffold (skipped) |
| Audit-log-required | `node --test tests/lylo/scaffold/audit-log-required.test.js` | Scaffold (skipped) |

---

## 1. What CI currently enforces (hard-fails the build)

- **Migration numbering.** Every `.sql` directly under `db/migrations/`
  must match `NNN_name.sql`. Duplicate numbers fail.
- **Migration discovery.** A `.sql` file outside the approved zones
  (`db/migrations/NNN_*.sql`, `db/migrations/_archive/**`,
  `db/schema.sql`, `tests/**`) fails the build.
- **New archive execution.** Any *new* reference to
  `db/migrations/_archive/` from an executable command surface
  (`package.json` scripts, `*.ps1`, `*.sh`, `render.yaml`, workflow
  run-steps) fails the build.
- **Formatting (scoped).** Files under `.github/`, `scripts/ci/`,
  `tests/lylo/`, and this plan doc must have a final newline, no
  trailing whitespace, and no focused tests (`.only(`).

---

## 2. What is scaffolded but not active

- **RLS isolation tests** (`cross-subject-isolation`,
  `forbidden-cross-domain-query`) — runner wired, every test skipped.
  The authoritative RLS matrix is **PR #20 (PR-E-tests v2)**; these
  scaffolds defer to it and are placeholders until PR-E.
- **Feature-flag-off parity** — runner wired at the path pinned by the
  shell plan §8 (`tests/lylo/feature-flag-off-parity.test.js`); skipped
  until Shell-4.
- **Audit-log-required** — runner wired; skipped until the memory store
  lands (Shell-8).
- Every scaffold test body throws if un-skipped, so a scaffold can
  never fake a pass.
- **Repo-wide lint/format.** The format check is scoped to the new
  CI / governance surface only. A full ESLint + Prettier setup across
  the existing codebase is not done here.

---

## 3. What remains manual

- Applying migrations — owner-applied against a snapshot, then
  production (see `db/migrations/README.md`).
- Reviewing and approving every PR; CI does not auto-merge.
- The PR-E 7-day RLS shadow period and the `RLS_ENFORCED` flip.
- Confirming env-var names and the `LYLO_SHELL_MODE` flag name.
- Removing the archive-execution debt (see §4).
- Secret / credential management and Render configuration.

---

## 4. What blocks promotion to enforcement mode

Enforcement mode (zero-tolerance, no baseline) is blocked until:

1. **The archive-execution baseline is empty.** The four recorded
   references (`package.json` scripts `setup:consciousness`,
   `continuity:setup`, `memory:deploy`, and `deploy-windows.ps1`) must
   be removed or re-pointed at numbered migrations. That is a separate,
   owner-gated PR — this PR does not change `package.json` or
   `deploy-windows.ps1`. Once the baseline is empty,
   `.github/ci-baseline/archive-execution-allowlist.json` is deleted
   and the guard becomes zero-tolerance.
2. **The four test scaffolds are implemented** — RLS isolation and
   forbidden cross-domain query (with / after PR-E / PR #20),
   feature-flag-off parity (Shell-4), audit-log-required (Shell-8).
3. **Repo-wide lint/format** is adopted (ESLint + Prettier) and the
   format job is widened beyond the CI / governance surface.
4. **Branch protection** is configured so the jobs are required checks
   on `master` — an owner / admin action, not something CI can
   self-apply.

Until all four are done, CI stays in report mode.

---

## Note on the archive-execution guard

The guard could instead hard-fail immediately on the four known
references. That was not chosen, because fixing them is explicitly
deferred (it requires changing `package.json` / `deploy-windows.ps1`),
and a permanently red required check is not a usable baseline. The
baseline allowlist is explicit, version-controlled, and printed on
every run — it records debt rather than hiding it, and still fails the
build for any *new* violation. If the owner prefers immediate hard
failure, delete the baseline file and the guard becomes zero-tolerance
with no other change.

---

## Relationship to the gates

This PR moves Shell §0 **gate 2 ("Baseline CI")** from "does not exist"
to "exists, in report mode". Promotion to enforcement mode is tracked
by §4 above. The other §0 gates (PR #20, PR #12, the governance docs)
are unaffected by this PR.

---

## Cross-references

- `.github/workflows/baseline-ci.yml` — the workflow.
- `.github/ci-baseline/archive-execution-allowlist.json` — known-debt baseline.
- `scripts/ci/` — the three guard scripts.
- `tests/lylo/` — the test scaffolds.
- `db/migrations/README.md` — the migration rules the discovery guard enforces.
- `docs/lylo/empty-companion-shell.md` §0 — names baseline CI as gate 2.
- `docs/lylo/governance-vocabulary-lock.md`, `docs/lylo/source-of-truth-memory-policy.md` — the governance intent these guards will enforce (PR #24).
