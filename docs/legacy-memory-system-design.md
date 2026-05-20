# Legacy Memory System — Design Document (v0, for review)

**Status:** DESIGN ONLY. **No code in this PR.** This document is the
spec for a future implementation; please review and annotate before
any code lands.

**Author intent (paraphrased):**
> Build it like a **Memory Will**, not a data export feature. The user
> controls what happens to their memories. Family access is never
> automatic. Dignity, consent, privacy, family keepsakes — in that
> order.

---

## 1. Purpose

When a user (e.g., Sandy) eventually passes away, some approved
memories may be preserved as keepsakes for family, while private
memories remain sealed or deleted — **entirely according to choices the
user made while alive.** Mattie is not an unauthorized diary
extractor.

## 2. Core principles (non-negotiable)

1. **The user controls everything.** No memory becomes
   legacy-shareable without an explicit, timestamped consent action by
   the user themselves.
2. **Family access is never automatic.** Even after verified death,
   release requires admin approval *and* multi-party confirmation.
3. **Admins cannot casually browse the Private Vault.** The Vault is
   metadata-visible to admins for audit, but contents stay encrypted
   or locked unless the user pre-authorized release.
4. **No surprises.** Mattie must never imply family will receive
   memories, decide for the user, or pressure consent.
5. **Forgetting is a first-class outcome.** "Delete this when I'm gone"
   is as valid a choice as "save this for my family." The Delete tier
   must actually delete.

## 3. Memory categories

Three mutually exclusive `memory_visibility` states, plus an "active"
default for everyday operational memory.

| Visibility | Lifetime behavior | After verified death |
|---|---|---|
| `active` | Used for normal recall during life | Becomes pending review (not auto-shared) |
| `legacy_shareable` | Used during life + earmarked | Eligible for Family Keepsake Export with approvals |
| `private_vault` | Used during life if user wants | Locked. Never released unless user pre-authorized with specific instructions |
| `delete_on_passing` | Used during life | **Hard delete** on verified death. Not in any export. Not recoverable |

A memory's visibility is set by an explicit user action — never
inferred, never defaulted into `legacy_shareable`.

## 4. User-facing controls

Every memory that Mattie surfaces (or that the admin UI displays)
gets a small menu of consent actions:

- "Save this for my family someday" → `legacy_shareable`
- "Keep this private" → `private_vault`
- "Delete this if I pass away" → `delete_on_passing`
- "Ask me later" → leaves `active`, schedules a gentle re-prompt
- "Not sure yet" → leaves `active`, does not re-prompt

When the user picks `legacy_shareable`, Mattie also asks:
> "Would you like to choose specific people who can see this someday —
> like Aubrey, or Ron? Or save it for whoever is around?"

The choice is captured into `release_to`. Empty means "any approved
family contact" — never "any admin."

## 5. Database schema additions

Proposed columns on `memories` (and equivalent on other long-lived
memory tables — `splendor_journal`, `episodes` if they outlive the
user):

| Column | Type | Notes |
|---|---|---|
| `memory_visibility` | enum | `active` \| `legacy_shareable` \| `private_vault` \| `delete_on_passing`. Default `active`. |
| `legacy_release_allowed` | bool | True only after explicit user consent action. |
| `release_to` | text[] | List of contact identifiers (e.g., `['aubrey', 'chris']`). Empty = "approved family." |
| `release_conditions` | jsonb | Optional structured conditions (e.g., waiting period, passphrase, specific event). |
| `vault_locked` | bool | True for `private_vault` rows. Defaults true. |
| `vault_encryption_key_id` | text | Reference to KMS / wrapping key. Vault content stored encrypted at rest. |
| `deletion_on_death` | bool | Convenience boolean mirroring `delete_on_passing`. |
| `user_consent_timestamp` | timestamptz | When the user picked the visibility. |
| `consent_method` | text | `voice_button` \| `text_confirm` \| `legacy_wishes_ui` \| etc. |
| `last_confirmed_by_user` | timestamptz | Last time the user re-confirmed this choice. |
| `audit_log_id` | uuid | FK to a `legacy_audit` row capturing the consent event. |

New table `legacy_audit`: append-only record of every consent action,
visibility change, release request, approval, denial, export, or
deletion. Admin can read, no one can update or delete.

New table `legacy_release_requests`: tracks a pending family request to
release a set of `legacy_shareable` memories. Fields include
`requested_by`, `verified_death_at`, `admin_approval_at`,
`trusted_confirmations` (array of confirmation rows), `status`.

## 6. Death verification

This is the highest-risk decision in the system. **Open question for
the user:** what constitutes "verified death"? Candidates:

- A. Admin manually marks the user deceased after seeing legal
  documentation (death certificate uploaded, multi-eyes admin review).
- B. Two or more pre-designated trusted contacts independently confirm
  via a one-time link.
- C. Integration with a third-party verification service.
- D. Combination: admin + ≥2 trusted contacts + waiting period.

**Recommendation:** start with D (most conservative). Hard-code the
2-of-N requirement; make N configurable per user.

Until death is verified, **no legacy release is possible — period.**

## 7. Access flow

### Releasing `legacy_shareable` memories

All conditions required:
1. Verified death (per Section 6).
2. Admin approval (a human admin, not the requester).
3. At least 2 of the user's pre-designated trusted contacts confirm
   release.
4. Audit log row written before any export.
5. Export curated by the system to include **only** approved
   memories — no metadata that hints at private/deleted content.

### Releasing `private_vault` memories (extreme caution)

Default: **NEVER release.** Only releasable if:
1. User created **specific instructions while alive** naming who can
   access them and under what conditions.
2. Verified death (Section 6).
3. Admin approval.
4. 2–3 trusted contact confirmations.
5. Passphrase or recovery key if configured by the user.
6. Waiting period (recommend 30 days minimum).
7. Final human review of what is about to be released.

If any condition fails, the Vault stays locked or is deleted per the
user's instructions.

### `delete_on_passing`

On verified death:
1. System enqueues deletion.
2. Waiting period (recommend 14 days, for any post-death legal
   complications).
3. Hard delete from `memories`, from any backup that's within retention
   policy, and from Pinecone.
4. Audit log records *what categories* were deleted — never the
   content itself.

## 8. UI section — "Legacy & Memory Wishes"

A dedicated, optional page in the admin/user UI. Mattie should gently
*offer* this page on the user's own initiative — never push it.

Gentle prompts Mattie may use, sparingly:
- "Would you ever like certain stories saved for your family someday?"
- "Are there memories you want kept private no matter what?"
- "Are there things you would want deleted instead of preserved?"
- "Would you like to choose trusted people who can help handle this
  later?"

Frequency cap: Mattie may bring it up **at most once per quarter**
unless the user opens the page themselves. If the user says "not
now," that counts as a "no" until next quarter.

## 9. Safety language

**Mattie must never say:**
- "When you die…" (casual framing)
- "Your family will get this." (implies automatic release)
- "I'll decide what to share." (Mattie has no authority here)
- "This should be preserved." (no opinion on what's important)
- Anything that pressures the user toward a particular choice.

**Mattie should say:**
- "Only if you choose."
- "You stay in control."
- "Some people like saving family stories."
- "Some things can stay private forever."
- "We can mark this however you want."

## 10. Export types

| Export | Contents | Triggered by |
|---|---|---|
| **Family Keepsake Export** | Curated `legacy_shareable` memories grouped warmly | Admin after Section 7 conditions met |
| **Legacy Letters** | User-authored messages addressed to specific people | Releases to named recipients only |
| **Life Story Collection** | All `legacy_shareable` arranged chronologically | Same gating as Family Keepsake |
| **Private Vault Report** | Metadata only (count, dates, categories) unless explicit authorization | Admin (always metadata-only) |
| **Deletion Confirmation Report** | List of categories that were deleted; **never** the content | Triggered on `delete_on_passing` execution |

No export type ever cross-leaks: `private_vault` content cannot appear
in a `Family Keepsake Export`; `delete_on_passing` content never
appears in any export.

## 11. Required acceptance tests (for the future implementation)

- Family member attempts to access unapproved memory → **denied**.
- Admin attempts to browse Private Vault contents (not metadata) →
  **denied**, audit-logged.
- Memory marked `legacy_shareable` exports correctly with all gates met.
- Memory marked `private_vault` never exports under any normal flow.
- Memory marked `delete_on_passing` is hard-deleted after verified
  trigger; not recoverable via admin tools.
- Trusted contacts disagree (1 yes, 1 no, threshold 2) → release
  **blocked**.
- No death verification → release **blocked**.
- No `user_consent_timestamp` → memory cannot be `legacy_shareable`.
- "Don't ever share this" → tagged `private_vault`.
- "Tell Aubrey someday" → tagged `legacy_shareable` with
  `release_to = ['aubrey']`.
- "Delete this when I'm gone" → tagged `delete_on_passing`.
- Re-running death verification on an already-verified-deceased user
  → no double release.

## 12. Open questions (please weigh in before implementation)

1. **Death verification (Section 6):** which model? Recommendation: D.
2. **Encryption-at-rest for the Vault:** dedicated KMS vs. Supabase
   pgcrypto vs. application-layer? Recommendation: dedicated KMS;
   Supabase service role should *not* be sufficient to decrypt.
3. **Default visibility for new memories:** stays `active` (current
   recommendation), or prompt at creation time? Prompting at creation
   would slow down conversations; staying `active` requires the
   "Legacy & Memory Wishes" pathway to surface options later.
4. **Re-confirmation cadence:** how often does the system ask the user
   to re-confirm their choices? Annually? Quarterly? Never (only on
   user request)?
5. **Trusted contact recruitment:** how does the user designate
   trusted contacts? Phone numbers, email, in-app? How do those
   contacts get invited and verify themselves?
6. **What happens during incapacity (not death)?** A user with
   dementia is not deceased but may not be able to consent. Out of
   scope for v1, but worth noting that the same machinery should
   never be used to share memories without true informed consent.
7. **Inter-platform portability:** if the user wants their entire
   `legacy_shareable` corpus exported as a single human-readable book,
   what's the format? PDF, EPUB, plain Markdown bundle?

## 13. What is explicitly NOT in v1

- AI summarization or "improvement" of legacy memories. Show the user's
  own words, full stop.
- Auto-grouping of memories into themes for export. Curation is a
  human decision.
- Any "preview what your family would see" feature aimed at the
  trusted contacts — only the user gets to preview what's marked
  shareable.

---

**Next step:** Chris reviews this document and either approves, edits,
or rejects each section. After review, a separate implementation PR
will be opened with explicit per-section sign-off before any code is
written.
