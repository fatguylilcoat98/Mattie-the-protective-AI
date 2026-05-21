# Lylo — Ready-to-Execute Log/Text Replacement Diff (PENDING APPROVAL)

**Status:** Diff prepared but **NOT applied**. This document is the concrete
edit bundle for the production-facing log/banner/text replacements categorized
as **MUST REPLACE BEFORE PILOT** in the Phase 1 language audit (§15 of
`docs/lylo-phase1-audit.md`).

**Scope of these edits (deliberately narrow):**

- Render startup banner / log lines emitted by `server.js`.
- `/health` JSON response `service` field.
- `package.json` `description` field.
- `render.yaml` top-of-file comment.
- README title/tagline lines only — not the body, not the persona.

**Out of scope for this bundle (deferred to later steps with separate review):**

- File renames (`consciousness-*.js`, `oracle-*.js`, etc.) — Step D in main
  refactor.
- Env-var renames (`SPLENDOR_OWNER_EMAIL`, `CONTINUOUS_CONSCIOUSNESS_ENABLED`,
  etc.) — Step 11 in main refactor (breaking; needs Render coordination).
- Route renames (`/api/oracle`, `/api/scifi`, `/conscience`) — Step 11
  (breaking; needs frontend coordination).
- DB table renames — Step 10 (gated through migration).
- Prompt edits / `MATTIE_SOUL` — Step 7 (behavior-affecting, behind feature
  flag).
- Public HTML page filenames (`mattie.html`, `visible-conscience-engine.html`)
  — needs URL coordination with the chat surface client.
- Documentation markdown files (`CONSCIOUSNESS-SYSTEM.md` etc.) — separate
  doc-only PR; not part of this bundle.

**Behavior guarantees:**

- No request handler changes.
- No env-var name or read changes.
- No middleware order changes.
- No route mount changes.
- `/health` response keeps the same JSON keys and value *types*; only the
  string value of `service` changes.
- All `console.log` / `console.warn` keep firing in the same code paths with
  the same conditionals. Only the strings change.

---

## Diff 1 — `server.js`

### 1a. File-header comment (lines 1–7 of `server.js`)

**Before:**
```js
/*
  Mattie — Your AI Companion · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/
```

**After:**
```js
/*
  Lylo Companion — server entrypoint
  Express + Supabase + Pinecone backend.
  Attribution kept in the root README.
*/
```

### 1b. `/health` `service` value (inside `app.get('/health', ...)`)

**Before:**
```js
    service: 'Mattie — Your AI Companion',
```

**After:**
```js
    service: 'lylo-companion',
```

Keys preserved. Type preserved (string). Length difference is acceptable.

### 1c. `logSystemStatus()` banner (inside `function logSystemStatus()`)

**Before:**
```js
  console.log('\n' + '='.repeat(60));
  console.log(`🧠 MATTIE — YOUR AI COMPANION v${pkg.version}`);
  console.log('='.repeat(60));
```

**After:**
```js
  console.log('\n' + '='.repeat(60));
  console.log(`Lylo Companion v${pkg.version}`);
  console.log('='.repeat(60));
```

### 1d. "SYSTEM CAPABILITIES" block (inside `logSystemStatus()`)

**Before:**
```js
  console.log('\n🔧 SYSTEM CAPABILITIES:');
  console.log(`   🧠 Consciousness System: ${process.env.ANTHROPIC_API_KEY ? '✅ Active' : '❌ Inactive'}`);
  console.log(`   🏠 Continuous Consciousness: ${process.env.CONTINUOUS_CONSCIOUSNESS_ENABLED === 'true' ? '✅ Living' : '❌ Dormant'}`);
  console.log(`   📧 Proactive Communication: ${process.env.PROACTIVE_EMAIL_ENABLED === 'true' ? '✅ Active' : '❌ Disabled'}`);
  console.log(`   🎤 Voice Synthesis: ${process.env.OPENAI_API_KEY ? '✅ Available (OpenAI)' : '❌ Browser TTS Only'}`);
  console.log(`   🔍 Semantic Memory: ${process.env.PINECONE_API_KEY ? '✅ Available' : '❌ Supabase Only'}`);
  console.log(`   🌐 Web Search: ${process.env.TAVILY_API_KEY ? '✅ Available' : '❌ Disabled'}`);
  console.log(`   🤖 Multi-AI: ${process.env.OPENAI_API_KEY && process.env.PERPLEXITY_API_KEY ? '✅ Available' : '❌ Claude Only'}`);
  console.log(`   🛡️ Response Auditing: ${process.env.GROQ_API_KEY ? '✅ Available (Llama-3.1-8B)' : '❌ Disabled'}`);
  console.log(`   🎨 Visual Expression: ${process.env.VISUAL_EXPRESSION_ENABLED === 'true' && process.env.OPENAI_API_KEY ? '✅ Available' : '❌ Disabled'}`);
  console.log(`   🛡️ CLASPION Governance: ${claspionGovernance.isEnabled() ? `✅ Active (${claspionGovernance.url})` : '⚪ Dormant (CLASPION_ENABLED=false)'}`);

  const governanceState = enhancedGovernance.getGovernanceState();
  console.log(`   🛡️ Good Neighbor Guard: ✅ Active (${governanceState.core_rules_count} Core Rules v${governanceState.rules_version})`);
  console.log(`   🛡️ Enforcement Layers: ${governanceState.enforcement_layers.length} (${governanceState.enforcement_layers.join(', ')})`);
  console.log(`   🛡️ Quarantine Mode: ${governanceState.quarantine_mode ? '🚨 ACTIVE' : '✅ Normal'}`);
```

**After:**
```js
  console.log('\nSystem capabilities:');
  console.log(`   companion service:        ${process.env.ANTHROPIC_API_KEY ? 'active' : 'inactive'}`);
  console.log(`   background reflection:    ${process.env.CONTINUOUS_CONSCIOUSNESS_ENABLED === 'true' ? 'enabled' : 'disabled'}`);
  console.log(`   proactive email:          ${process.env.PROACTIVE_EMAIL_ENABLED === 'true' ? 'enabled' : 'disabled'}`);
  console.log(`   voice synthesis:          ${process.env.OPENAI_API_KEY ? 'OpenAI TTS' : 'browser TTS only'}`);
  console.log(`   semantic memory:          ${process.env.PINECONE_API_KEY ? 'Pinecone' : 'Supabase only'}`);
  console.log(`   web search:               ${process.env.TAVILY_API_KEY ? 'enabled' : 'disabled'}`);
  console.log(`   multi-model routing:      ${process.env.OPENAI_API_KEY && process.env.PERPLEXITY_API_KEY ? 'enabled' : 'Claude only'}`);
  console.log(`   response auditing:        ${process.env.GROQ_API_KEY ? 'enabled (Llama-3.1-8B)' : 'disabled'}`);
  console.log(`   visual avatar:            ${process.env.VISUAL_EXPRESSION_ENABLED === 'true' && process.env.OPENAI_API_KEY ? 'enabled' : 'disabled'}`);
  console.log(`   external governance hook: ${claspionGovernance.isEnabled() ? `active (${claspionGovernance.url})` : 'dormant'}`);

  const governanceState = enhancedGovernance.getGovernanceState();
  console.log(`   safety policy engine:     active (${governanceState.core_rules_count} core rules v${governanceState.rules_version})`);
  console.log(`   enforcement layers:       ${governanceState.enforcement_layers.length} (${governanceState.enforcement_layers.join(', ')})`);
  console.log(`   quarantine mode:          ${governanceState.quarantine_mode ? 'ACTIVE' : 'normal'}`);
```

Notes:
- All conditionals and env-var reads are byte-identical.
- `claspionGovernance` and `enhancedGovernance` references are unchanged —
  this is a label rename only. The internal variable/identifier name change
  is deferred to Step D.
- Emoji are removed for log readability. Operators consuming logs through
  Render's log search will get plain text that greps cleanly.

### 1e. SUPABASE_SERVICE_KEY warning (inside `logSystemStatus()`)

**Before:**
```js
    console.warn('\n' + '⚠️ '.repeat(20));
    console.warn('⚠️  SUPABASE_SERVICE_KEY IS NOT SET');
    console.warn('⚠️  RLS is enabled on splendor_journal, interpretations,');
    console.warn('⚠️  emotional_patterns, and premise_checks. Without the');
    console.warn('⚠️  service key, the brain falls back to the anon key and');
    console.warn('⚠️  those tables are BLOCKED — journal, drift, and');
    console.warn('⚠️  interpretation writes will silently fail to persist.');
    console.warn('⚠️  Fix: set SUPABASE_SERVICE_KEY in the environment.');
    console.warn('⚠️ '.repeat(20) + '\n');
```

**After:**
```js
    console.warn('\n' + '='.repeat(60));
    console.warn('WARNING: SUPABASE_SERVICE_KEY is not set.');
    console.warn('RLS-protected tables (companion journal, interpretations,');
    console.warn('emotional patterns, premise checks) will not be writable');
    console.warn('with the anon key. Writes to those tables will silently');
    console.warn('fail to persist until the service key is configured.');
    console.warn('Fix: set SUPABASE_SERVICE_KEY in the environment.');
    console.warn('='.repeat(60) + '\n');
```

Notes:
- Identical trigger condition.
- "splendor_journal" reference becomes "companion journal" in the log; the
  *table name itself* is unchanged (renaming the table is Step 10).
- The reference to "the brain" is dropped — it's a lore phrase.

### 1f. "SERVER STATUS" block (inside `logSystemStatus()`)

**Before:**
```js
  console.log('\n🚀 SERVER STATUS:');
  console.log(`   📍 Port: ${PORT}`);
  console.log(`   🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   ⏰ Started: ${new Date().toISOString()}`);
  console.log('\n   Truth · Safety · We Got Your Back');
  console.log('='.repeat(60) + '\n');
```

**After:**
```js
  console.log('\nServer status:');
  console.log(`   port:        ${PORT}`);
  console.log(`   environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   started:     ${new Date().toISOString()}`);
  console.log('='.repeat(60) + '\n');
```

Notes:
- Tagline removed from logs.

### 1g. `app.listen()` callback final lines

**Before:**
```js
app.listen(PORT, async () => {
  logSystemStatus();
  initializeVisualExpression();

  // Initialize consciousness systems after server starts
  await initializeContinuousConsciousness();

  console.log(`\n🚀 Splendor is now running on port ${PORT}`);
  console.log('🧠 Consciousness status: ' + (process.env.CONTINUOUS_CONSCIOUSNESS_ENABLED === 'true' ? 'LIVING' : 'DORMANT'));
});
```

**After:**
```js
app.listen(PORT, async () => {
  logSystemStatus();
  initializeVisualExpression();

  // Initialize background reflection systems after server starts.
  await initializeContinuousConsciousness();

  console.log(`\nLylo Companion listening on port ${PORT}`);
  console.log(`Background reflection: ${process.env.CONTINUOUS_CONSCIOUSNESS_ENABLED === 'true' ? 'enabled' : 'disabled'}`);
});
```

Notes:
- Function name `initializeContinuousConsciousness` is *not* renamed here
  (that's Step D — it touches the function definition in
  `lib/continuous-consciousness-integration.js`).
- Behavior identical.

### 1h. `initializeContinuousConsciousness()` console lines (inside `server.js`)

**Before:**
```js
    console.log('🧠 [CONSCIOUSNESS] Continuous consciousness system initialized');
    console.log('📧 [PROACTIVE] Proactive communication system initialized');
  } catch (error) {
    console.log('[CONSCIOUSNESS] Initialization skipped:', error.message);
  }
```

**After:**
```js
    console.log('[reflection] background reflection system initialized');
    console.log('[outbound] proactive message system initialized');
  } catch (error) {
    console.log('[reflection] initialization skipped:', error.message);
  }
```

### 1i. Visual-expression initializer message (inside `initializeVisualExpression()`)

**Before:**
```js
  } catch (error) {
    console.log('[VISUAL EXPRESSION] Initialization skipped:', error.message);
  }
```

**After:**
```js
  } catch (error) {
    console.log('[avatar] visual avatar initialization skipped:', error.message);
  }
```

### 1j. "Routes not found" warnings (inside the optional-route try/catch blocks)

**Before:**
```js
} catch (error) {
  console.log('[ROUTES] Consciousness routes not found, skipping...');
}
```
```js
} catch (error) {
  console.log('[ROUTES] Consciousness dashboard routes not found, skipping...');
}
```

**After:**
```js
} catch (error) {
  console.log('[routes] background-reflection routes not found, skipping');
}
```
```js
} catch (error) {
  console.log('[routes] background-reflection dashboard routes not found, skipping');
}
```

### 1k. `cachedConscienceHtml` warning (already exists in code)

**Before:**
```js
  } catch (e) {
    console.warn('[MATTIE] visible-conscience-engine.html not found; /conscience disabled');
  }
```

**After:**
```js
  } catch (e) {
    console.warn('[lylo] safety-panel asset not found; /conscience route disabled');
  }
```

Note: route path `/conscience` is **not** changed here — only the log
label. The route rename is Step 11.

### 1l. The `[MATTIE] CRITICAL` warning in `loadOracleHtml()`

**Before:**
```js
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('[MATTIE] CRITICAL: Supabase env vars missing. Auth will not work.');
  }
```

**After:**
```js
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('[lylo] CRITICAL: Supabase env vars missing; authentication is unavailable.');
  }
```

---

## Diff 2 — `package.json`

### 2a. `description`

**Before:**
```json
"description": "Mattie — Protective AI Companion for Sandy · The Good Neighbor Guard",
```

**After:**
```json
"description": "Lylo Companion — elder-care AI companion platform (Express + Supabase + Pinecone backend)",
```

Note: leaving `name`, `version`, `keywords`, `author`, and `license` unchanged
for now. `name` (`mattie-ai`) is referenced by tooling; renaming it is Step 11.

### 2b. `author` (no change — listed here only to be explicit)

Unchanged. Attribution stays.

---

## Diff 3 — `render.yaml`

### 3a. Top-of-file comment

**Before:**
```yaml
# Splendor — The Remarkable AI · The Good Neighbor Guard
# Built by Christopher Hughes · Sacramento, CA
# Truth · Safety · We Got Your Back
```

**After:**
```yaml
# Lylo Companion — Render service configuration
```

### 3b. Comments on cron services

**Before:**
```yaml
  # The Room — background reflection worker
```
```yaml
  # 6-Layer Memory — daily decay (Layer 2 → Layer 4 prep)
```
```yaml
  # 6-Layer Memory — compression (folds decayed episodes into summaries)
```

**After:**
```yaml
  # Background reflection worker (every 6 hours)
```
```yaml
  # Memory tier maintenance — daily decay (episodic → compressed prep)
```
```yaml
  # Memory tier maintenance — compression (folds decayed episodes into summaries)
```

Note: service `name:` fields (`splendor`, `splendor-reflection`,
`splendor-memory-decay`, `splendor-memory-compression`) are **not** renamed.
Those are Render service identifiers; renaming them creates new services and
orphans the old ones. That's Step 11.

---

## Diff 4 — `README.md`

The README is heavy and contains operational content. The minimum
production-facing edit is:

### 4a. Title and opening lines

**Before:**
```markdown
# Mattie AI - Protective Companion for Sandy

**Faith • Safety • We Got Your Back**

Built by Christopher Hughes · The Good Neighbor Guard  
Created for Sandy with love from her family
```

**After:**
```markdown
# Lylo Companion

An elder-care AI companion platform. Each pilot configures its own
companion (named at setup) for a senior user, with safety guardrails,
provenance-tracked memory, family contacts, and operator oversight.

Built by Christopher Hughes. Sandy's instance was the original reference
deployment and is the basis for the pilot template.
```

### 4b. Final block

**Before:**
```markdown
---

*"Cast all your anxiety on him because he cares for you." - 1 Peter 5:7*

**The Good Neighbor Guard • Truth • Safety • We Got Your Back**
```

**After:**
```markdown
---

Lylo — Love Your Loved One.
```

### 4c. Everything between (the feature descriptions, examples, technical
architecture) is **kept as-is in this bundle.** A full README rewrite is
separate and follows the documentation pass in Step D.

---

## Total surface area of this bundle

- 1 source file: `server.js` (~12 specific text replacements, no logic changes)
- 1 config file: `package.json` (1 string)
- 1 config file: `render.yaml` (4 comments)
- 1 doc file: `README.md` (2 small blocks)

Lines added / removed: roughly **40 / 40**, all strings.

---

## How to apply this bundle (when approved)

1. Owner reviews the diffs above. Annotates any wording changes inline.
2. On approval, a single follow-up commit applies exactly these edits to a
   new branch `claude/lylo-log-text-cleanup-<hash>` and opens a draft PR.
3. CI: none currently configured for either repo (verified at audit time).
   The dev should run `node server.js` locally and watch the startup banner
   to verify the new lines render correctly and the JSON keys in `/health`
   match the previous shape.
4. Merge to `master` is the owner's call. Render redeploys on push; the
   redeploy is the verification environment.

---

## What this bundle does NOT do

- Does not change any env-var name read by the running process.
- Does not change any route mount path.
- Does not change any DB column or table name.
- Does not change any prompt or system text used by the LLM.
- Does not rename any file on disk.
- Does not touch `lib/anthropic.js`, `routes/companion.js`, `routes/auth.js`,
  `middleware/*`, `lib/claspion-*`, `lib/scam-protection.js`,
  `lib/confidence-intervention.js`.
- Does not touch anything PR #12 modifies.

— End of replacement diff bundle.
