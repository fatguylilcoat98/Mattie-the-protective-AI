# Lylo — Incident Response

**Owner:** project lead.
**Reviewers:** owner + on-call rotation members.
**Cadence:** review quarterly; update after any incident.

## Severity definitions

- **SEV-1**: data leak (any private memory exposed to a non-owner
  user, even a single row); credential compromise (any committed
  or production-side secret); RLS misconfiguration that returns
  another pilot's data; companion has produced a fabricated
  memory that reached a senior. Page on-call immediately.
- **SEV-2**: chat surface is down; setup wizard rejects valid
  input for a real pilot; vault unlock is failing for a real
  user; audit log write is failing (fail-closed action aborted).
  Notify on-call within 15 minutes.
- **SEV-3**: cosmetic issue, partial degradation, a single
  background worker tick failed but the next tick will recover.
  Triage during business hours.

## On-call rotation

- **Primary:** ___________ (phone: ___________)
- **Secondary:** ___________ (phone: ___________)
- **Owner/escalation:** ___________ (phone: ___________)

(Populate these placeholders before any pilot launch. Do not
launch a pilot with empty on-call fields.)

## Escalation tree

```
  Issue reported
        |
   Primary on-call (5 min ack)
        |
   Secondary on-call (10 min if primary unreachable)
        |
   Owner (15 min if secondary unreachable)
        |
   Project lead / pilot partner contact
```

For SEV-1, the owner is paged in parallel with the primary; the
tree above is for SEV-2 / SEV-3.

## Triage checklist (first 15 minutes)

1. **Confirm the severity.** Is private data exposed? Did a
   memory get fabricated and reach the user? Is the chat
   surface returning errors?
2. **Stop the bleeding.** For SEV-1 data exposure, flip
   `RLS_ENFORCED=false` only if RLS is the suspected cause; for
   companion fabrication, flip
   `RESPONSE_AUDITOR_STRICT_MODE=true`; for chat-surface outage,
   roll back to the previous deploy on Render.
3. **Preserve evidence.** `pg_dump` the relevant rows to an
   off-site backup before doing any restore. Save Render logs
   covering the incident window.
4. **Communicate.** Notify the pilot partner using the template
   below. Be specific about scope ("one user's private memory
   was visible to one family member for X minutes"). Do not
   speculate.

## Comms template

```
Subject: [Lylo pilot <partner-name>] Incident notification - <YYYY-MM-DD>

Hi <pilot-partner-contact>,

At <timestamp UTC>, we identified an issue with the Lylo
system that affected your pilot. Specifically:

  <one-line factual description, no speculation>

Scope: <number of users / number of rows / time window>.
Impact: <what was visible / not visible to whom>.
Current status: <mitigated / under active investigation>.

We have:
  - <action 1>
  - <action 2>

Next update by: <timestamp UTC>.

<on-call name>
```

Never use the words "may have", "could have", or "possibly". If
you don't know, say "we are still confirming the scope."

## Post-incident

Within 5 business days of resolution:

- [ ] Write a postmortem in `docs/security/incidents/<date>.md`
      with: timeline, root cause, blast radius, what worked,
      what didn't, action items.
- [ ] Review with the owner.
- [ ] Share a redacted summary with the pilot partner.
- [ ] File issues for each action item with explicit owners and
      due dates.

## What this document does NOT cover

- Day-to-day pilot operations — those live in
  `docs/readiness/launch-runbook.md`.
- Threat modeling — that lives in `docs/security/threat-model.md`.
- Data handling / encryption / backup — that lives in
  `docs/security/data-handling.md`.
- DSAR workflow — that lives in `docs/security/dsar-handling.md`
  (to be drafted in a follow-up PR).

— End of incident response policy.
