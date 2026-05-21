# Lylo — Security Overview (for pilot partners)

**Audience:** nonprofit staff, senior-center coordinators,
caregiver-organization compliance / IT contacts, and any external
reviewer asked to greenlight a Lylo pilot. Written in plain
language; no engineering jargon.

## What Lylo is

Lylo is an AI companion platform paired with a memory and
governance layer. It is built to support people who benefit from
consistent companionship, memory continuity, and the option to
preserve their own stories — seniors, people with memory or
learning challenges, neurodivergent users, isolated users, and
families preserving history.

Each pilot configures its own companion at setup. The companion's
name is chosen by the user or family (Grace, Ellie, Thomas, etc.
— not enforced by Lylo). The chosen name locks into that pilot's
configuration so the companion's identity does not drift.

Lylo is **not** marketed as conscious, sentient, alive, AGI, a
therapy replacement, a caregiver replacement, a medical treatment,
a diagnostic system, or an emergency-response substitute.

## Trust rules Lylo follows

- **Truth-first.** The companion does not invent memories. If it
  does not have a verified record of something, it says so and
  may ask the user to fill it in.
- **Privacy-first.** Every memory is private by default. The
  user chooses what to share with family, and when.
- **User-controlled.** The user owns their data: view it, export
  it, change visibility, delete it.
- **Auditable.** Every change to visibility, every privileged
  read, every administrative action is recorded in a log the
  user can request.
- **Boundaries respected.** Three visibility levels (private,
  family-shared, password-locked) and a 4-role access model
  (senior, family, caregiver, admin) ensure no one casually sees
  what the user has not chosen to share.

## The three visibility levels

- **Private** *(default).* Only the user. No family member, no
  caregiver, no Lylo operator can see this content. Background
  systems can use it only when composing a message addressed to
  the user themselves.
- **Family-shared.** Approved family members (the user picks who)
  can read these. Useful for shared history and stories.
- **Password-locked.** Sensitive memories that require a PIN
  before they can be viewed by anyone, including the companion.
  After five wrong PIN attempts the vault is locked for 30
  minutes.

The user changes visibility levels. The companion does not
auto-promote anything.

## Who can see what (in plain language)

| Viewer | Private | Family-shared | Password-locked |
|---|---|---|---|
| **The user (senior)** | yes | yes | yes, after unlocking |
| **Approved family / caregivers** | no | yes (the user picks who) | no |
| **Lylo operator / admin** | no (content) | yes (content) | no (content) |
| **Background processes** | only when emailing the user themselves | yes | never |

Admin staff can see *metadata* (counts, timestamps, who accessed
what) for audit purposes. They cannot read the *content* of
private or locked memories. Ever.

## What we hold

- The user's chosen name, their family contacts' names and
  relationships, their preferences (what to talk about, what to
  avoid, communication style).
- Conversation history and memories the user has shared with
  the companion.
- Optional voice recordings tied to Legacy Project mode (only
  if the user opts in).
- An audit log of every visibility change and every privileged
  read.

## What we do not hold

- Government identifiers (Social Security number, driver's
  license, passport).
- Payment information.
- Medical records, diagnoses, prescriptions.
- Real-time location.
- Biometric data beyond optional voice recordings.

If a pilot wants to add any of the above, the conversation
stops and the project lead reviews whether Lylo's design
accommodates it. Most do not belong here.

## Where the data lives

- Postgres (Supabase) for the structured data and audit logs.
  Encrypted at rest.
- Pinecone for the search index over memories. Per-pilot
  namespace so other pilots cannot read into another's data.
- Voice blobs (if used) in encrypted blob storage.
- API credentials in the host provider's environment-variable
  vault — never in the codebase.

All connections are TLS 1.2 or higher.

## What we back up and for how long

- Daily database backups, encrypted, stored off-site, 30-day
  retention.
- Weekly Pinecone snapshots per pilot.
- Audit log retained 7 years.
- Memory rows retained as long as the user wants them.
- A senior who asks for their data deleted has it deleted
  (soft delete after 5 days; hard delete after 30 days or
  immediately on request).

## How a senior can ask for their data

The senior (or a legally-authorized representative) can ask the
operator at any time to:

- See every piece of data Lylo holds about them.
- Receive a portable copy (the "export").
- Correct an entry that is wrong.
- Delete some or all of their data.
- Stop a specific kind of processing (e.g. "stop the proactive
  emails").

The full process and timelines are in
`docs/security/dsar-handling.md`. The short version: acknowledge
within 5 business days; fulfill access requests within 30 days.

## What happens in an incident

If something goes wrong — a wrong visibility, an unauthorized
access attempt, a backup failure — the operator follows the
`docs/security/incident-response.md` runbook:

- Severity is rated (data leak = highest).
- On-call is paged.
- The pilot partner contact is notified by email using a
  documented template (factual, no speculation).
- A written postmortem is shared with the partner within 5
  business days of resolution.

Incidents that touch the partner's users are always disclosed
to the partner.

## What the partner is asked to do

- Designate a single contact at the partner organization for
  Lylo to email in case of incident.
- Designate which family members or caregivers are authorized
  to receive shared memories for which users (if applicable
  to the pilot's model).
- Read this document and the DSAR handling document and
  acknowledge them in writing.
- Help Lylo run the quarterly DSAR drill against a synthetic
  senior so the operator response is tested.

## What this document is and is not

It is a single-page summary suitable for sharing with a partner
organization's compliance, IT, or legal contact. It is not a
legal document and is not a substitute for the partner's own
review.

For the engineering-level detail, see
`docs/security/threat-model.md`, `docs/security/data-handling.md`,
and `docs/privacy/visibility-audit-policy.md`.

— End of pilot security overview.
