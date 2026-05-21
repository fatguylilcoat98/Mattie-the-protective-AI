# Lylo — Pilot Readiness Checklist

**Owner:** project lead. **Reviewer:** owner. **Cadence:** re-run
before every external pilot kickoff.

A Lylo pilot is **not ready** to be shown to an external pilot
organization (family, senior center, nonprofit, caregiver group)
until every item below is checked. Items map to the eight PRs in
the execution plan (PR #17). Each box should be either:

- `[x]` complete, with an artifact link or commit reference, or
- `[w]` explicitly waived by the owner, with a one-line reason
  recorded inline.

Do not show a pilot externally with any unchecked, unwaived item.

## Architecture & schema

- [ ] **PR A (parts 1 + 2) merged.** Target repo structure exists
      under `db/`, `docs/`, `src/`. Scattered SQL files have been
      `git mv`'d into `db/migrations/archive/`. `package.json` and
      `deploy-windows.ps1` reference the new paths.
- [ ] **PR #12 merged and verified.** Sandy reset complete;
      foundation memories seeded; backup taken; post-reset
      verification ran clean.
- [ ] **PR C merged.** `pilot_instances`, `user_profiles`,
      `family_contacts`, `companion_profiles`,
      `companion_persona_templates`, `safety_policies` exist.
      `users` has nullable `role` and `pilot_instance_id`.
- [ ] **PR D merged.** `memory_store` (or `memory_items`) has
      `visibility_level` defaulting to `'private'`. Vault tables
      exist. `memory_visibility_audit_log` is append-only.
- [ ] **`db/schema.sql` matches a fresh `pg_dump`** of live, with
      the date stamp recorded in `docs/architecture/system-map.md`.

## Setup mode

- [ ] **PR B merged and `SETUP_MODE_ENABLED=true` for the target
      pilot.** A new pilot can be onboarded end-to-end via the
      wizard. Profile locks on completion.
- [ ] **Lock semantics verified.** Re-opening setup on a locked
      profile is refused with 403 unless owner-authenticated.
- [ ] **Wizard validation tested.** Missing required fields are
      rejected with 400. Invalid companion-name characters are
      rejected.
- [ ] **Vault PIN flow tested** (if vault used). Wrong PIN locks
      the vault after 5 attempts; lockout duration enforced.

## Privacy & RLS

- [ ] **PR E merged with `RLS_ENFORCED=false` initially.**
- [ ] **7-day shadow-diff period complete with `<0.01%`
      mismatch rate.** Diff log archived under
      `backups/rls-shadow-<date>/`.
- [ ] **`RLS_ENFORCED=true`** flipped after the shadow period.
- [ ] **Visibility matrix tests pass** — every role × every
      visibility level (~30 tests, from PR E-tests).
- [ ] **Family role cannot see `private` memories** — confirmed
      against a real test pilot via a `lylo_family` session.
- [ ] **Admin role cannot see `content` of `private` or
      `password_locked` memories** — confirmed via the admin
      view.
- [ ] **Background workers cannot read `password_locked` rows.**
      Verified by running the proactive-message worker against a
      pilot with locked memories and confirming the locked
      content is never referenced in any outbound draft.
- [ ] **Derived rows inherit the most restrictive source
      visibility.** Verified via the inheritance tests in
      `tests/lylo/`.

## No-fabrication enforcement

- [ ] **Schema-layer provenance is enforced.** Every
      `memory_store` row has a non-null `provenance` from the
      allowed enum.
- [ ] **Prompt-layer rule is in place.** The companion's system
      prompt includes the "no fabricated memories" foundational
      rule.
- [ ] **Response auditor flags fabrications.** Tested via the
      adversarial suite in `tests/lylo/`.
- [ ] **Legacy mode adversarial tests pass** (if Legacy mode
      enabled for the pilot).

## Audit & retention

- [ ] **Audit log records visibility changes.** Every change
      writes a row to `memory_visibility_audit_log`. Confirmed
      via spot-check.
- [ ] **Audit log is append-only.** `UPDATE` / `DELETE` from
      the application role raises a permission error.
- [ ] **Retention policy documented and configured.** 7-year
      retention on `memory_visibility_audit_log`. Soft-delete
      semantics for memory rows. Backup retention documented in
      `docs/security/data-handling.md`.
- [ ] **DSAR workflow tested.** A senior can request, view, and
      delete all of their data within the documented SLA.

## Security posture

- [ ] **Incident-response on-call defined.** Phone tree current.
      Escalation tree current. Tested with a mock incident.
- [ ] **Threat model reviewed.** Sign-off from the owner.
- [ ] **`.env*` files outside `.env.example` are not in the
      tree.** Verified via
      `git ls-tree HEAD -- '*.env*' | grep -v '.env.example'`.
- [ ] **Render env vars hold the real secrets.** Real companion
      sender address, API keys, service keys, JWT secrets all
      live in Render only.
- [ ] **`pg_dump` schedule defined.** Daily off-site with
      encryption-at-rest verified.
- [ ] **Backup restore tested** to a throwaway Supabase project,
      within the documented SLA.

## Language audit

- [ ] **No `consciousness`, `oracle`, `soul`, `awakening`,
      `sentient`, `spirit`, `digital being`, `alive`, `AGI`
      strings** in user-facing files (`*.js`, `*.md`, `*.html`,
      `*.json` outside `db/migrations/archive/`).
- [ ] **Render startup banner is professional.** Verified via PR
      #15 (already merged).
- [ ] **README opens with "Lylo Companion"** (already true post
      PR #15).
- [ ] **`/health` returns `service: "lylo-companion"`** (already
      true post PR #15).

## Pilot tooling

- [ ] **PR G merged.** `scripts/create-pilot-instance.js` produces
      a working pilot from a clean state.
- [ ] **`scripts/demo-data-generator.js` never emits real-pilot
      identifiers.** Verified by the demo-data-generator test
      in `tests/lylo/`.
- [ ] **Cross-pilot isolation verified.** Pilot A user cannot
      read pilot B data (RLS enforces).

## Documentation

- [ ] **`docs/readiness/launch-runbook.md` reviewed by the owner.**
- [ ] **`docs/security/incident-response.md` reviewed by the
      owner and the on-call rotation members.**
- [ ] **`docs/security/threat-model.md` reviewed by the owner.**
- [ ] **`docs/pilot/security-overview.md` written** (single page,
      plain language, suitable for the pilot partner).
- [ ] **`docs/pilot/onboarding-guide.md` written** for the
      operator.
- [ ] **`docs/architecture/system-map.md` matches actual state.**

## Sign-off

- [ ] **Owner has reviewed every item above and either checked
      it or waived it with a recorded reason.**
- [ ] **Date of pilot launch recorded:** _____________
- [ ] **Pilot partner organization:** _____________
- [ ] **Pilot scope (number of seniors, family members, modes
      enabled):** _____________

— End of pilot readiness checklist.
