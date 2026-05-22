# Lylo Source-of-Truth Memory Policy

**Status:** Draft — gate-progress
**Satisfies:** Empty Companion Shell plan (`docs/lylo/empty-companion-shell.md`) §0, gate 4 — "Source-of-truth memory policy".
**Depends on:** `docs/lylo/governance-vocabulary-lock.md` — every term below is defined there and used here exactly as locked.
**Scope:** Documentation only. No code, schema, routes, prompts, migrations, or behavior.
**Does not:** start Shell-1, or any Shell PR.

---

## Purpose

This policy defines how a `claim` becomes — or is prevented from
becoming — a trusted `memory`, and how that trust changes over a
memory's life. It is the authority for every Shell PR that writes,
classifies, promotes, retracts, supersedes, or reads memory.

---

## 1. The three provenance classes

| Class | Origin | May enter `governed context`? | How promoted |
|---|---|---|---|
| `VERIFIED_FACT` | Confirmed by an authoritative `source` | Yes, without caveat | n/a — already top class |
| `USER_STATED` | A first-party human stated it | Yes, subject to admissibility (§4) | To `VERIFIED_FACT` only via §3 |
| `AI_INFERRED` | Model inference/summary | Restricted (§5) | To `VERIFIED_FACT` only via §3 |

Every `memory` carries exactly one class and immutable `provenance`
naming its `source`.

---

## 2. `VERIFIED_FACT` lifecycle

States: `proposed` → `pending_confirmation` → `verified` →
(`superseded` | `retracted`).

1. **proposed** — a `claim` is recorded with a candidate `source`. Not
   yet a `VERIFIED_FACT`; classified by origin (`USER_STATED` or
   `AI_INFERRED`).
2. **pending_confirmation** — the claim is routed to an authorized
   source for confirmation. `authority validation` decides who is
   allowed to confirm.
3. **verified** — on explicit confirmation (§3), a `VERIFIED_FACT` is
   recorded and a `provenance` event is appended.
4. **superseded / retracted** — a `VERIFIED_FACT` may later be
   superseded (§7) or retracted (§6). It is never silently edited.

---

## 3. Core rule — model output cannot self-promote

> Model output, inference, summarization, or pattern-matching can never
> become a `VERIFIED_FACT` without explicit confirmation from a human
> source or an authoritative external source. There is no automatic
> promotion path from `AI_INFERRED` to `VERIFIED_FACT`.

An `AI_INFERRED` record may be *presented to* an authorized human for
confirmation. If confirmed, a **new** `VERIFIED_FACT` is created with
`provenance` linking back to the inferred predecessor. The original
`AI_INFERRED` record is **not** mutated.

---

## 4. `USER_STATED` / self-asserted handling

- Trusted as "the user (or a first-party human) said this" — not as
  established truth.
- The `admissibility` default for `USER_STATED` is owner-decided
  (`owner-decisions-needed-before-shell-1.md`, Q4): auto-admit, or
  require owner approval per fact.
- A `USER_STATED` claim may be promoted to `VERIFIED_FACT` only via the
  §3 explicit-confirmation path, with proper `authority validation`.
- Conflicting `USER_STATED` claims are routed to disputed handling
  (§8).

---

## 5. `AI_INFERRED` restrictions

- Always `provenance`-tagged as model-originated.
- Strictest `admissibility`: never auto-admitted into `governed
  context` that drives consequential behavior (safety, financial,
  family-contact actions) without review.
- May support soft conversational continuity only where the
  vocabulary doc's `governed context` rules permit, and must always be
  distinguishable from human-asserted memory.
- Never represented to the user or family as fact.

---

## 6. Retraction behavior

- Retraction marks a `memory` inadmissible; content and `provenance`
  are preserved.
- Retraction is itself an immutable `provenance` event and an `audit
  log` event.
- A retracted memory is excluded from `governed context` and from
  `continuity reconstruction`.
- Retraction never deletes.

---

## 7. Supersession behavior

- Supersession creates a **new** `memory` and links the old one as its
  predecessor.
- The old memory becomes inadmissible-by-supersession; it is preserved.
- The supersession chain is queryable for audit.
- Editing a memory in place is forbidden — correction is always
  supersession.

---

## 8. Disputed memory handling

- When two admissible memories assert conflicting claims, or a `source`
  disputes an existing memory, the affected memory or memories enter a
  `disputed` `admissibility` state.
- Disputed memories are inadmissible until resolved.
- Resolution is `retraction` of one, `supersession`, or owner
  adjudication via `authority validation`. Every step is recorded in
  `provenance` and the `audit log`.

---

## 9. Inadmissible memory handling

- Inadmissible = stored but excluded from `governed context`. Causes:
  pending approval, `disputed`, `retracted`, `superseded`, or
  `password_locked` and not yet unlocked for the session.
- Inadmissible memories remain in storage and in the `audit log`. They
  are never silently dropped or deleted.

---

## 10. Provenance immutability

- `provenance` is append-only. Existing provenance entries are never
  edited or deleted.
- Every governance action appends a new provenance event.
- A memory's origin `source`, timestamp, and intake path can never
  change after creation.

---

## 11. Default privacy = `private`

- Every new `memory` is created with `visibility` = `private`.
- Raising visibility to `family_shared` or `password_locked` requires
  `authority validation` and is `audit log`-recorded.
- No code path may create a memory at a broader visibility than
  `private` by default.

---

## 12. `family_shared` rules

- A `family_shared` memory is visible to the owning user and to family
  members linked to that user within the same `pilot instance`.
- Raising a memory to `family_shared` requires `authority validation`.
- The owning user may lower a memory back to `private` at any time;
  the change is `audit log`-recorded.

---

## 13. `password_locked` rules

- A `password_locked` memory is gated by a vault secret and is not
  surfaced into `governed context` until the secret is supplied for
  the session.
- Vault PIN length and lockout policy are owner-decided
  (`owner-decisions-needed-before-shell-1.md`, Q3; PR #20 default is
  5 attempts / 30-minute lockout).
- Vault access — both success and failure — is `audit log`-recorded.

---

## 14. Audit requirements

- Every memory creation, `admissibility` transition, `retraction`,
  `supersession`, `visibility` change, `authority validation` outcome,
  and vault access is written to the `audit log`.
- Audit entries are append-only and never enter `governed context`.

---

## 15. No fabricated memory rule

> The Companion must never create, store, or present a `memory` that no
> `source` asserted. The model may not invent a `claim` and store it as
> any class of memory. `continuity reconstruction` may only assemble
> existing admissible memories — it may not synthesize new claims and
> persist them. Conversational inference that is not stored is not a
> memory; if it is stored, it is `AI_INFERRED`, `provenance`-tagged, and
> bound by §5.

---

## Cross-references

- `docs/lylo/governance-vocabulary-lock.md` — locked definitions of
  every term used above.
- `docs/lylo/empty-companion-shell.md` — §0 names this doc as gate 4.
- PR #20 (PR-E-tests v2) — the RLS / privacy contract that enforces
  `visibility` at the database row level.
- PR #21 (PR-H2) — retention policy §7, referenced by the shell plan
  for per-pilot pause/retention behavior.

## Change control

This policy is locked. Changes are made only by a reviewed PR against
this file, which must list the Shell PRs and docs affected.
