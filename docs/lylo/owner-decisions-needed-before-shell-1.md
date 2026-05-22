# Owner Decisions Needed Before Shell-1

**Status:** Draft — awaiting owner input.
**Source:** `docs/lylo/empty-companion-shell.md` §14 ("Owner Decisions Requested Before Shell-1 Opens").
**Scope:** Documentation only.
**Blocking:** Shell-1 does not open until every item below is answered and recorded here. This is one of the conditions in the shell plan's gating section.

---

## How to use this file

The Empty Companion Shell plan §14 requires the owner to answer seven
questions before Shell-1 opens. They are reproduced verbatim below.
Each is currently marked **❌ UNANSWERED**.

- Do **not** infer or assume answers. Record only what the owner
  explicitly decides.
- When an item is answered: replace its status line with
  **✅ ANSWERED (YYYY-MM-DD)** and fill the **Answer** field with the
  owner's exact decision.
- Every Shell PR references this file; an unanswered item blocks the
  Shell PRs that depend on it.

---

## Q1 — Supabase tenancy model

> One Supabase project per pilot, or shared Supabase with pilot-instance scoping?

**Why it matters:** determines the `pilot instance` isolation boundary,
the RLS design in PR-E, and per-pilot backup/retention handling.

**Status:** ❌ UNANSWERED
**Answer:** —

---

## Q2 — Pilot-1 target partner

> Pilot-1 target partner (so Setup Mode copy is right)?

**Why it matters:** Setup Mode wording, onboarding copy, and the
Shell-5 wizard content depend on knowing the first partner.

**Status:** ❌ UNANSWERED
**Answer:** —

---

## Q3 — Vault PIN length and lockout policy

> Vault PIN length and lockout policy — accept PR #20 defaults (5 attempts, 30 min) or override?

**Why it matters:** governs `password_locked` access and the vault
rules in `source-of-truth-memory-policy.md` §13.

**Status:** ❌ UNANSWERED
**Answer:** —

---

## Q4 — Memory admissibility default

> Memory admissibility default — auto-approve `USER_STATED` or require owner approval for every fact?

**Why it matters:** sets the default `admissibility` for
`USER_STATED` memories (`source-of-truth-memory-policy.md` §4) and the
operator review workload.

**Status:** ❌ UNANSWERED
**Answer:** —

---

## Q5 — Legacy Project default scope

> Legacy Project default scope — family-readable, or private-by-default until explicit share?

**Why it matters:** sets the default `visibility` for Legacy Project
content (Shell-10) against the policy's default-`private` rule.

**Status:** ❌ UNANSWERED
**Answer:** —

---

## Q6 — Voice support in pilot-1

> Voice support in pilot-1, or text-only first?

**Why it matters:** decides whether Shell-7's voice integration is in
scope for the first pilot flip.

**Status:** ❌ UNANSWERED
**Answer:** —

---

## Q7 — Confirm the master flag name

> Confirm `LYLO_SHELL_MODE` is the env var name (or pick a different one)?

**Why it matters:** `feature-flag-model.md` recommends `LYLO_SHELL_MODE`
as the master mount switch. The name must be owner-confirmed before any
flag code is written (Shell-4).

**Status:** ❌ UNANSWERED
**Answer:** —

---

## Summary

| # | Question | Status |
|---|---|---|
| Q1 | Supabase tenancy model | ❌ UNANSWERED |
| Q2 | Pilot-1 target partner | ❌ UNANSWERED |
| Q3 | Vault PIN length / lockout | ❌ UNANSWERED |
| Q4 | Memory admissibility default | ❌ UNANSWERED |
| Q5 | Legacy Project default scope | ❌ UNANSWERED |
| Q6 | Voice in pilot-1 | ❌ UNANSWERED |
| Q7 | Confirm `LYLO_SHELL_MODE` name | ❌ UNANSWERED |

**0 of 7 answered.** Shell-1 remains blocked.
