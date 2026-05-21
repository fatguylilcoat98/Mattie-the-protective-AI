# src/governance

Domain: safety policies, foundational rules, response auditor,
scam protection, confidence-routed intervention, no-fabrication
guard.

## What lives here (target state)

- `safety-policies.{js,ts}` - read/write to `safety_policies`,
  evaluation against the active rule set on every chat turn.
- `foundational-rules.{js,ts}` - the constitutional rules ("no
  fabricated memories", "no medical claims", "no claim of
  consciousness"). Loaded from `safety_policies` at startup.
- `confidence-intervention.{js,ts}` - the NORMAL / PROTECTION /
  VERIFY / ESCALATION risk router.
- `scam-protection.{js,ts}` - pattern-based scam-message
  detection.
- `response-auditor.{js,ts}` - the post-response Groq Llama check
  that flags fabricated assertions and lore-language slips.
- `no-fabrication-guard.{js,ts}` - the pre-response check that
  refuses to assert memories not present in the retrieved
  context.

## What does NOT live here

- Audit log writes - those live in `src/audit/`. Governance
  *uses* the audit log; the audit log *itself* is a separate
  module.
- RLS policies - those live in `db/migrations/`.

## Migration source

Current code that this module will absorb:

- `lib/scam-protection.js`
- `lib/confidence-intervention.js`
- `lib/response-auditor.js`
- `lib/good-neighbor-guard-rules.js`
- `lib/claspion-enhanced-integration.js`
- `lib/claspion-governance.js`
- `middleware/claspion-middleware.js`

The `CLASPION` and `Good Neighbor Guard` lore names will be
replaced with the generic `safety_policy_engine` framing in a
later PR (execution plan PR Step 11, breaking; coordinated with
Render env updates). PR A does not rename anything.
