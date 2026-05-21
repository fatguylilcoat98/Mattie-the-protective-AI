# src/memory

Domain: the unified `memory_store` table, memory write/read
services, provenance enforcement, retrieval, and Pinecone sync.

## What lives here (target state)

- `store.{js,ts}` - write path. The single function every chat
  surface uses to persist a memory row. Enforces provenance,
  visibility, and the no-fabrication rule on write.
- `retrieve.{js,ts}` - read path. Returns context for the
  companion prompt assembler. Respects visibility (after PR E).
- `categorize.{js,ts}` - bucketing into `memory_categories`.
- `audit.{js,ts}` - writes to `memory_audit_log` and
  `memory_visibility_audit_log` on every write/read.
- `pinecone-sync.{js,ts}` - mirrors approved memory rows into
  the per-user Pinecone namespace.
- `decay.{js,ts}` - background decay-score worker output
  consumer.
- `compress.{js,ts}` - background compression worker output
  consumer.

## What does NOT live here

- Reflections (companion's interpretations of memories) - those
  live in their own table and a dedicated module that will land
  in a later PR.
- The legacy archive - that lives in `src/legacy/`.

## Migration source

Current code that this module will absorb:

- `lib/supabase.js::storeMemory()` and `getMemoriesForUser()`
- `lib/enhanced-memory-integration.{js,ts}` and the V2 memory
  service files in `lib/`.
- `lib/6-layer-chat-integration.js`, `lib/4-tier-chat-integration.js`
- `lib/pinecone-sync-service.ts`
- `lib/memory/*.js` (the partial cleanup that already exists).

The absorption strategy is the dual-write step in §13 Step 8 of
the execution plan. No code is moved here by PR A.
