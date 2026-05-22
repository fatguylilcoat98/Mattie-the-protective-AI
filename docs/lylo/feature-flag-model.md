# Lylo Feature-Flag Model (Recommended)

**Status:** Draft — recommendation, not ratified.
**Scope:** Documentation only. No code, no CI, no env-var changes.
**Action required:** the owner must confirm the `LYLO_SHELL_MODE` name (`owner-decisions-needed-before-shell-1.md`, Q7) before any flag code is written (Shell-4).
**Does not:** start Shell-1, or reconcile anything in code.

---

## Why this doc exists

Two planning documents describe feature flags differently:

- The **execution plan** (PR #17, `docs/readiness/lylo-execution-plan.md`)
  uses multiple per-feature flags: `SETUP_MODE_ENABLED`,
  `READ_FROM_V2`, `LEGACY_MODE_ENABLED`, `RLS_ENFORCED`.
- The **shell plan** (PR #23, `docs/lylo/empty-companion-shell.md`)
  uses a single master flag: `LYLO_SHELL_MODE`.

They are **not actually in conflict** — they operate at different
layers. The defect is documentary: neither plan says how the two relate.
This doc records the recommended hierarchy so the two are reconciled
*on paper* before any code is written.

---

## Recommended hierarchy

### Layer 1 — master mount switch: `LYLO_SHELL_MODE`

- Env var, default **`false`**.
- **`false`:** new routes 404; chat uses `MATTIE_SOUL`; no new tables
  are read or written; existing behavior is byte-identical. (Asserted
  by `tests/lylo/feature-flag-off-parity.test.js`, named in shell plan
  §8.)
- **`true`:** shell routes mount; the companion profile loads from the
  DB; pilot-instance scoping is active.
- **Flip-off rollback:** set `false` and redeploy. The additive-only
  schema policy means no data is destroyed.
- This is the single kill-switch. Shell-12 flips it to `true` for
  **pilot-1 only**.

### Layer 2 — RLS enforcement: `RLS_ENFORCED` (independent)

- Env var, default **`false`**.
- Governs database row-level-security **enforcement**, not shell mount.
- Deliberately **independent** of `LYLO_SHELL_MODE`: PR-E requires a
  7-day shadow period before enforcement (execution plan), and that
  flip must not be coupled to the shell mount.
- Valid combination: shell mounted (`LYLO_SHELL_MODE=true`) while RLS
  is still in shadow (`RLS_ENFORCED=false`).

### Layer 3 — capability sub-flags (effective only when `LYLO_SHELL_MODE=true`)

- `SETUP_MODE_ENABLED`, `READ_FROM_V2`, `LEGACY_MODE_ENABLED`.
- Env vars, each default **`false`**.
- Each gates one capability for staged rollout **inside an
  already-mounted shell**.
- When `LYLO_SHELL_MODE=false` these have no effect — there is nothing
  mounted for them to gate.

---

## Precedence rules

1. `LYLO_SHELL_MODE=false` ⇒ every Layer-3 flag is inert.
2. `RLS_ENFORCED` is evaluated independently and may be `false` while
   the shell is mounted.
3. A Layer-3 sub-flag set `true` while `LYLO_SHELL_MODE=false` is a
   no-op, not an error — but baseline CI, once it exists, should warn
   on that combination.

---

## Explicitly NOT done here

- No flag code is written or changed.
- No CI is added or changed.
- No env vars are set in any environment.
- `LYLO_SHELL_MODE` is a **proposed** name pending owner confirmation
  (`owner-decisions-needed-before-shell-1.md`, Q7). If the owner picks
  a different name, this doc and the shell plan are updated together,
  before Shell-4.

---

## When this gets reconciled in code

Layer-1/2/3 wiring lands in **Shell-4** ("Feature flag +
companion-profile loader"), behind the gates in the shell plan §0. Not
before. Until then this hierarchy is documentation only.

---

## Cross-references

- `docs/lylo/empty-companion-shell.md` — §8 (feature flag + rollback),
  §9 (PR sequence, Shell-4).
- `docs/readiness/lylo-execution-plan.md` — origin of the per-feature
  flags and the PR-E 7-day shadow period.
- `docs/lylo/owner-decisions-needed-before-shell-1.md` — Q7 confirms
  the master flag name.
