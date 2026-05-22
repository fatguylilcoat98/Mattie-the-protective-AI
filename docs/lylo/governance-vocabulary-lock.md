# Lylo Governance Vocabulary Lock

**Status:** Draft — gate-progress
**Satisfies:** Empty Companion Shell plan (`docs/lylo/empty-companion-shell.md`) §0, gate 3 — "Governance vocabulary lock doc".
**Scope:** Documentation only. No code, schema, routes, prompts, or behavior.
**Does not:** start Shell-1, or any Shell PR.

---

## Why this doc exists

The Lylo Companion refactor spans many PRs written across many sessions.
Terms like "memory", "fact", and "provenance" have drifted in meaning
between documents. This file is the **single, locked definition** of each
governance term. Every Shell PR, every migration `-- Plan:` comment, and
every governance code path is expected to use each term exactly as
defined here.

A term is **locked**: once defined here it is not redefined casually. A
change to a definition is itself a reviewed PR against this file, and any
such PR must list the downstream docs and PRs that need re-checking.

**Notation.** A concept is written in `code font`. An enum value that a
column or flag is expected to hold is written in `UPPER_SNAKE` or
`lower_snake` as it will appear in data.

---

## A. Foundations

### source
The external origin of an assertion: a person (the user, a family
member, the owner/operator), a document, a sensor, or an upstream
system. A `source` is *who or what said it* — not the assertion itself.
Distinct from `provenance`, which is the *record of* the source plus the
chain of handling.

### provenance
The immutable metadata recording where a `claim` came from: which
`source` asserted it, when, by what path, and every governance action
taken since. Provenance answers "how do we know this?". It is
append-only (see `source-of-truth-memory-policy.md` §10). Distinct from
`source` (provenance *contains* a source reference) and from `memory`
(provenance is metadata *about* a memory, not its content).

### memory
A `claim` that has been stored with `provenance`, a record
classification, a `visibility` level, and an `admissibility` state.
"Memory" is the governed unit of recall. Raw model output and raw
conversation text are **not** memory until stored through the governed
path. Distinct from `claim` (unstored content) and from conversation
logs (which are `audit log` material, not memory).

### claim
A single discrete assertion about the world or the user (e.g. "Sandy
has a dog named Asher"). A claim is *content only*. It is not yet
trusted: a record classification (`verified fact` / `self-asserted
memory` / `AI-inferred record`) and an `admissibility` decision are
applied to it. Distinct from `memory`: a memory is a stored, classified,
provenance-bearing claim.

---

## B. Record classifications (the three provenance classes)

### verified fact — `VERIFIED_FACT`
A `memory` whose `claim` has been confirmed by an authoritative `source`
through `authority validation` and explicit human or source
confirmation. The strongest trust class; may be relied on in `governed
context` without caveat. Model output alone can never produce a
`VERIFIED_FACT` (see memory policy §3). Distinct from `self-asserted
memory`, which is trusted as "the user said so" but not independently
confirmed.

### self-asserted memory — `USER_STATED`
A `memory` whose `claim` originates from the user, or another
first-party human source, stating it — without independent
verification. Trusted *as a statement by that person*, not as
established fact. Distinct from `verified fact` (no independent
confirmation) and from `AI-inferred record` (a human asserted it; the
model did not infer it).

### AI-inferred record — `AI_INFERRED`
A `memory` whose `claim` was produced by the model inferring,
summarizing, or pattern-matching — not directly stated by a human
source. The weakest trust class. Always `provenance`-tagged as
model-originated and subject to the strictest `admissibility` and
`governed context` restrictions. It may be *promoted* only via the
explicit-confirmation path in the memory policy. Distinct from both
human classes: no human asserted the claim.

---

## C. Lifecycle and governance operations

### admissibility
The governance decision of whether a `memory` may enter `governed
context` and influence companion behavior. A memory can be stored yet
*inadmissible* (held, disputed, retracted, superseded, or pending
approval). Admissibility is separate from existence: inadmissible
memories are retained for `audit log` and `provenance` but excluded from
context assembly. Distinct from `visibility` (who may *see* a memory) —
admissibility is whether the *companion* may *use* it.

### authority validation
The check that a `source` actually has the standing to assert or confirm
a given `claim`, or to change a memory's `visibility` or `admissibility`
(e.g. only the owner/operator may confirm a `VERIFIED_FACT`). Authority
validation gates admissibility transitions and visibility changes.
Distinct from `admissibility` (the outcome) — authority validation is
the *who-is-allowed* check feeding it.

### retraction
Marking a `memory` as no longer asserted — because the asserting
`source` withdrew it, or it was found false. A retracted memory becomes
inadmissible; its content and `provenance` are preserved (never
deleted), and the retraction itself is a provenance event. Distinct from
`supersession`: retraction removes a claim from use *without* a
replacement.

### supersession
Replacing a `memory`'s `claim` with a newer, corrected, or more current
claim. The old memory is preserved and linked as the superseded
predecessor; a new memory record is created. Distinct from `retraction`
(no replacement) and from editing (the old record is never overwritten
— supersession creates a new record and links back).

---

## D. Context assembly

### continuity reconstruction
The process of assembling a coherent, time-ordered picture of the user
and the relationship from stored, *admissible* memories across sessions
— so the companion "remembers" without re-deriving. It reads only
admissible memories and respects `visibility` rules. Distinct from
`governed context`: continuity reconstruction is the *process*; governed
context is the *resulting filtered working set*.

### governed context
The filtered, admissibility-checked, visibility-respecting set of
memories and profile data assembled for a single companion turn. It is
the **only** memory surface the model sees: anything not in governed
context cannot influence the response. Distinct from raw memory storage
(governed context is a per-turn projection of it) and from `continuity
reconstruction` (the process that builds part of it).

---

## E. Visibility model

### visibility
The access-control classification on a `memory` (and on certain profile
fields) determining *who may see it*. One of `private`, `family_shared`,
`password_locked`. Enforced at the database row level by RLS (PR #20 /
PR-E). Distinct from `admissibility` (whether the *companion* may use
it): a memory can be `private` yet admissible, or `family_shared` yet
inadmissible.

### private
The default `visibility`. The memory is visible only to the user it
belongs to (and the system path serving that user). Not visible to
family members or other pilot roles. Every new memory is `private`
unless an authorized actor explicitly raises it.

### family_shared
The `visibility` level where a memory is visible to the user *and* to
family members linked to that user within the same `pilot instance`.
Raising a memory to `family_shared` requires `authority validation`.
Distinct from `private` (user only) and `password_locked` (gated by a
separate secret).

### password_locked
The `visibility` level where a memory is gated behind a separate vault
secret (PIN/password) and is not surfaced into `governed context` until
that secret is supplied for the session. Lockout policy is owner-decided
(see `owner-decisions-needed-before-shell-1.md`, Q3). Distinct from
`private` (no extra secret) — `password_locked` adds a per-access
challenge.

---

## F. Audit

### audit log
The append-only record of governance-relevant events: memory creation,
`admissibility` transitions, `retraction`, `supersession`, `visibility`
changes, `authority validation` outcomes, and vault access. The audit
log is **not** `memory` and never enters `governed context`. It exists
for operator oversight, DSAR handling, and incident review. Distinct
from conversation logs, and from `provenance` (provenance is per-memory
metadata; the audit log is a system-wide event stream).

---

## G. Tenancy and profiles

### pilot instance — `pilot_instances`
One deployed Companion configured for one senior user and their circle,
within one partner/pilot engagement. It is the tenancy boundary: every
memory, profile, and audit row is scoped to exactly one pilot instance,
and cross-instance access is forbidden. Whether instances share a
Supabase project or each get their own is owner-decided
(`owner-decisions-needed-before-shell-1.md`, Q1). Distinct from the
profile records below, which are *configuration within* a pilot
instance.

### companion profile
The configuration of the Companion itself for a pilot instance: its name
(set during Setup Mode), persona calibration, voice settings, safety
posture. It is *about the AI*. Distinct from `user profile` (about the
human) and `continuity profile` (the evolving relationship picture).

### user profile
The durable, structured record of the senior user: identity, family
contacts, routines, preferences, and care-relevant facts. It is *about
the human*, built from admissible memories plus Setup Mode input.
Distinct from `companion profile` (about the AI) and `continuity
profile` (narrative/relationship state rather than structured fields).

### continuity profile
The evolving, reconstructed picture of the *relationship and ongoing
narrative* between user and Companion: open threads, recent events,
emotional context, follow-ups owed. Produced by `continuity
reconstruction`. Distinct from `user profile` (static structured facts)
— the continuity profile is the moving, session-to-session state.

---

## Cross-references

- `docs/lylo/source-of-truth-memory-policy.md` — how a `claim` becomes
  (or is prevented from becoming) a trusted `memory`; uses every term
  defined here.
- `docs/lylo/empty-companion-shell.md` — §0 names this doc as gate 3.
- `docs/lylo/feature-flag-model.md` — flag hierarchy gating the shell.
- `docs/lylo-memory-privacy-model.md` (audit-cleanup-plan branch) —
  earlier model input; superseded by this doc + the memory policy where
  they differ.

## Change control

This file is locked. To change a definition: open a reviewed PR against
this file only, state the old and new wording, and list every doc/PR
that references the term so they can be re-checked. Do not redefine a
term inline in another document.
