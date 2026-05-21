# Lylo security docs

Incident response, threat model, data handling, and operational
security posture for a Lylo pilot.

## What lives here (target state)

- `incident-response.md` - on-call rotation, escalation tree,
  severity definitions, comms template.
- `data-handling.md` - PII inventory, encryption at rest, encryption
  in transit, key rotation, backup posture.
- `threat-model.md` - STRIDE-style threat model with the
  Lylo-specific assets (memory store, vault, audit log, companion
  prompt) and the visibility-model assumptions.
- `dsar-handling.md` - data subject access request workflow.
  Senior's right to view, export, and delete their data, with the
  documented SLA and the operator runbook.

## What does NOT live here

- Memory visibility model (RLS policies, visibility levels) - that
  lives in `docs/privacy/`. The two are related; `security` covers
  how the system is defended against external threats and how
  incidents are handled, `privacy` covers what users can see and
  who.
