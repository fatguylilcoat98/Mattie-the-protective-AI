# Lylo — System Map

**Owner:** project lead.
**Cadence:** update when a major component lands or shape
changes.

A single-page map of the Lylo runtime, intended to give an
outside engineer or reviewer enough context to follow the rest
of the documentation.

```
  Browser / device
        |
        | HTTPS
        v
  +--------------------------------------+
  | Lylo Companion (Render web service)  |
  |                                      |
  |  +-----------------------------+     |
  |  | server.js                   |     |
  |  |  - Helmet, CORS, body parse |     |
  |  |  - Safety policy middleware |     |
  |  |  - Role-scoped DB client    |     |     (post-PR E)
  |  |    factory                  |     |
  |  |                             |     |
  |  |  Routes:                    |     |
  |  |  /api/auth                  |     |
  |  |  /api/companion             |     |
  |  |  /api/converse              |     |
  |  |  /api/memory                |     |
  |  |  /api/voice                 |     |
  |  |  /api/governance            |     |
  |  |  /api/setup        (gated)  |     |     (PR B)
  |  |  /api/legacy       (gated)  |     |     (PR F)
  |  |  /api/email                 |     |
  |  |  /api/proactive             |     |
  |  |  /health, /version          |     |
  |  +-----------------------------+     |
  |                                      |
  |  +-----------------------------+     |
  |  | src/governance/             |     |
  |  |  - Foundational rules       |     |
  |  |  - Scam protection          |     |
  |  |  - Confidence intervention  |     |
  |  |  - Response auditor (Groq)  |     |
  |  |  - No-fabrication guard     |     |
  |  +-----------------------------+     |
  +--------------------------------------+
       |                |             |
       | DB             | LLM         | Vector
       v                v             v
  +----------+     +----------+   +----------+
  | Supabase |     | Anthropic|   | Pinecone |
  | Postgres |     | OpenAI   |   | (per-    |
  |          |     | Perplex. |   |  pilot)  |
  | Tables:  |     | Groq     |   +----------+
  | - memory_|     | Tavily   |
  |   store  |     | ElevenLabs
  | - episodes
  | - memory_summaries
  | - reflection_archive
  | - users
  | - user_profiles    (PR C)
  | - companion_profiles (PR C)
  | - family_contacts  (PR C)
  | - memory_vaults    (PR D)
  | - memory_vault_sessions (PR D)
  | - memory_visibility_audit_log (PR D)
  | - audit_log
  | - safety_policies  (PR C)
  | - pilot_instances  (PR C)
  +----------+

  Background workers (Render cron):
    - reflection-worker            (every 6h)
    - memory-decay-worker          (daily 04:00 UTC)
    - memory-compression-worker    (daily 04:30 UTC)
    - continuity-worker            (shadow mode)
    - daily-log-worker             (daily, Pacific morning)
    - (optional) proactive-message-worker
    - (optional) background-reflection-worker
    Workers run under the `lylo_system` DB role (post-PR E).
    They cannot read `password_locked` rows. Ever.
```

## Data flows (chat round-trip)

1. Browser sends `POST /api/companion/chat` with the message.
2. `auth` middleware authenticates and sets `req.dbRole` and
   `req.dbUserId`.
3. The route handler opens a role-scoped Postgres client.
4. `src/governance/scam-protection` and
   `src/governance/confidence-intervention` may short-circuit
   the LLM call.
5. `src/memory/retrieve` fetches relevant memory rows. RLS
   enforces that only rows the requesting role may see are
   returned.
6. `src/companions/persona-builder` assembles the prompt from
   the `companion_profile`, the `user_profile`, the retrieved
   memories, and the active `safety_policies`.
7. The LLM is called. Response comes back.
8. `src/governance/response-auditor` and (in Legacy mode)
   `src/legacy/no-fabrication-guard` evaluate the response.
9. `src/memory/store` writes new memory rows with
   `visibility_level = 'private'` by default and the
   appropriate `provenance`.
10. `src/audit/audit-log` writes a row recording the
    interaction.
11. Response returned to the browser.

## Data flows (setup mode, post-PR B)

1. Operator opens `/api/setup/start` (gated by
   `SETUP_MODE_ENABLED`).
2. Step-by-step wizard collects companion name, senior name,
   family contacts, preferences, vault PIN.
3. Each step writes to `user_profiles` / `companion_profiles`
   / `family_contacts` (and optionally `memory_vaults`).
4. `POST /api/setup/complete` locks both profiles via
   `locked_at = now()`.
5. Subsequent chat round-trips use the locked configuration.

## Data flows (legacy mode, post-PR F)

1. Senior opens `/api/legacy/project/start` (gated by
   `LEGACY_MODE_ENABLED`).
2. `src/legacy/storytelling-engine` walks the senior through
   prompts.
3. Each user-supplied story lands in `legacy_stories` with
   `provenance = 'USER_STATED'`.
4. `src/legacy/no-fabrication-guard` runs on every companion
   response inside legacy mode.
5. On export, `src/legacy/export` produces a portable
   archive containing only user-supplied content.

## What is intentionally NOT in this diagram

- Detailed per-route schemas (those live in route-specific
  docs as PRs land).
- The legacy `MATTIE_SOUL` prompt evolution from
  `lib/anthropic.js` — it is in scope but will be replaced by
  `src/companions/persona-builder` (execution plan PR Step 7).
- The pre-PR-E single-service-key Postgres client. It still
  runs today and will be removed after the RLS shadow period.

— End of system map.
