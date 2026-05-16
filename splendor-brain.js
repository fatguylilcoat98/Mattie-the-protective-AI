/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Unified Brain v1.0 — Cognitive Architecture Integration Layer

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

/*
  CRITICAL: This file ONLY wires the eight council-delivered brain regions
  together. No module's internal logic is modified. Each region remains the
  sole steward of its own behavior; this layer threads outputs into inputs
  in the fixed pipeline order and returns one unified brain output object.

  Pipeline order (every conversation turn):
    1. RAS         — filters incoming signals first            (Grok)
    2. Hippocampus — retrieves memory                          (Claude)
    3. Thalamus    — routes and sets priority                  (Claude)
    4. Amygdala    — processes emotional tone                  (Gemini)
    5. Cerebellum  — checks patterns                           (Gemini)
    6. DMN         — background associative pass               (Grok)
    7. Prefrontal  — judges truth and safety                   (GPT)
    8. Broca/Wernicke — forms final response                   (GPT)
*/

/*
  =============================================================================
  SUPABASE MIGRATION SQL
  Run once in the Supabase SQL editor before first use. Only the Hippocampus
  persists state; all other regions are stateless or in-memory.
  =============================================================================

  CREATE TABLE IF NOT EXISTS splendor_memories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_id TEXT,
    turn_number INTEGER,
    content TEXT,
    tags TEXT[],
    importance_score FLOAT DEFAULT 0.5,
    created_at TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_splendor_memories_user
    ON splendor_memories(user_id);
  CREATE INDEX IF NOT EXISTS idx_splendor_memories_importance
    ON splendor_memories(importance_score DESC);

  =============================================================================
  INTEGRATION NOTE
  All four council section files are ES modules, so this unified file is also
  an ES module. The main response handler (CommonJS server.js) consumes it via
  dynamic import:

    const { processSplendorBrainTurn } = await import('./splendor-brain.js');
    const brain = await processSplendorBrainTurn({ ... });

  =============================================================================
*/

// --- IMPORT ALL 8 MODULES (4 council section files) ---
import { processHippocampus, processThalamus } from './splendor-brain-claude-sections.js';
import { processAmygdala, processCerebellum } from './splendor-brain-gemini-sections.js';
import { processPrefrontalCortex, processBrocaWernicke } from './splendor-brain-gpt-sections.js';
import { GrokConsciousnessModule, SaliencePacket } from './splendor-brain-grok-sections.js';

// Grok's RAS+DMN keep continuous state (arousal, self-narrative) across turns,
// so the consciousness module is instantiated once and persists per process.
const grok = new GrokConsciousnessModule();

/**
 * processSplendorBrainTurn — one full cognitive cycle.
 *
 * Input: {
 *   userId: string,
 *   sessionId: string,
 *   turnNumber: number,
 *   currentInput: string,
 *   detectedSentiment?: { type: 'positive'|'negative'|'neutral', score: number },
 *   sessionContext?: object,
 *   toneTarget?: string | null
 * }
 *
 * Output: one unified brain object (see bottom of function).
 */
export async function processSplendorBrainTurn(turnInput) {
  const {
    userId,
    sessionId,
    turnNumber,
    currentInput,
    detectedSentiment = null,
    sessionContext = {},
    toneTarget = null
  } = turnInput || {};

  // ---------------------------------------------------------------------------
  // STAGE 1 — RAS: filter incoming signals FIRST
  // The incoming user signal is wrapped as a SaliencePacket and run through
  // Grok's RAS gate. This mirrors GrokConsciousnessModule.tick()'s RAS phase
  // without altering its internal logic.
  // ---------------------------------------------------------------------------
  const incomingPacket = new SaliencePacket({
    source: 'user_input',
    content: currentInput || '',
    raw_intensity: detectedSentiment ? Math.min(1, Math.max(0, detectedSentiment.score || 0.5)) : 0.5,
    novelty: 0.7,
    emotional_valence: detectedSentiment
      ? (detectedSentiment.type === 'positive' ? 0.8
         : detectedSentiment.type === 'negative' ? 0.2 : 0.5)
      : 0.5,
    timestamp: Date.now() / 1000
  });

  const salientPackets = grok.ras.filter([incomingPacket]);
  if (salientPackets.length > 0) {
    const strongest = salientPackets.reduce((a, b) =>
      b.raw_intensity > a.raw_intensity ? b : a
    );
    grok.ras.update_arousal((strongest.raw_intensity - 0.5) * 0.3);
  }
  // Keep RAS coherence window fed for subsequent turns.
  grok.ras.recent_context.push(currentInput || '');

  const rasSignal = {
    current_arousal: grok.ras.current_arousal,
    salient_packets: salientPackets,
    salient_packets_count: salientPackets.length,
    passed_gate: salientPackets.length > 0
  };

  // ---------------------------------------------------------------------------
  // STAGE 2 — HIPPOCAMPUS: retrieve memory
  // ---------------------------------------------------------------------------
  const hippocampusOutput = await processHippocampus({
    userId,
    currentInput,
    sessionId,
    turnNumber
  });

  // ---------------------------------------------------------------------------
  // STAGE 3 — THALAMUS: route and set priority
  // ---------------------------------------------------------------------------
  const thalamusOutput = await processThalamus({
    currentInput,
    hippocampusOutput,
    rasSignal,
    sessionContext
  });

  // ---------------------------------------------------------------------------
  // STAGE 4 — AMYGDALA: process emotional tone
  // ---------------------------------------------------------------------------
  const amygdalaOutput = await processAmygdala({
    currentInput,
    detectedSentiment,
    retrievedMemories: hippocampusOutput.retrievedMemories
  });

  // ---------------------------------------------------------------------------
  // STAGE 5 — CEREBELLUM: check patterns / habits
  // ---------------------------------------------------------------------------
  const cerebellumOutput = await processCerebellum({
    currentInput,
    retrievedMemories: hippocampusOutput.retrievedMemories,
    emotionalContext: amygdalaOutput
  });

  // ---------------------------------------------------------------------------
  // STAGE 6 — DMN: background associative pass
  // Runs Grok's spontaneous-thought generator over the RAS-salient fragments.
  // Treated as a non-blocking critique/association pass: a failure here must
  // never break the response path.
  // ---------------------------------------------------------------------------
  let dmnOutput;
  try {
    const internalThought = grok.dmn.generate_spontaneous_thought(salientPackets);
    const surfaceProbability = grok.ras.current_arousal * 0.6;
    const now = Date.now() / 1000;
    const shouldSurface =
      Math.random() < surfaceProbability && (now - grok.last_thought_time > 0.8);
    if (shouldSurface) grok.last_thought_time = now;

    dmnOutput = {
      internal_narrative: grok.dmn.current_narrative_thread,
      spontaneous_thought: internalThought,
      current_arousal: grok.ras.current_arousal,
      surface_to_council: shouldSurface,
      surfaced_content: shouldSurface ? internalThought : null
    };
  } catch (err) {
    console.error('[DMN] Background pass error (non-fatal):', err.message);
    dmnOutput = {
      internal_narrative: grok.dmn.current_narrative_thread,
      spontaneous_thought: null,
      current_arousal: grok.ras.current_arousal,
      surface_to_council: false,
      surfaced_content: null
    };
  }

  // ---------------------------------------------------------------------------
  // STAGE 7 — PREFRONTAL CORTEX: judge truth and safety
  // ---------------------------------------------------------------------------
  const prefrontalOutput = await processPrefrontalCortex({
    userInput: currentInput,
    retrievedMemory: hippocampusOutput,
    emotionalContext: amygdalaOutput,
    habitPattern: cerebellumOutput,
    attentionPriority: thalamusOutput.attentionPriority,
    awarenessSignal: rasSignal,
    spontaneousThoughts: dmnOutput
  });

  // ---------------------------------------------------------------------------
  // STAGE 8 — BROCA/WERNICKE: form final response
  // ---------------------------------------------------------------------------
  const brocaWernickeOutput = await processBrocaWernicke({
    userInput: currentInput,
    decisionFrame: prefrontalOutput.decisionFrame,
    responseIntent: prefrontalOutput.responseIntent,
    emotionalContext: amygdalaOutput,
    memoryContext: hippocampusOutput,
    toneTarget,
    prefrontal: prefrontalOutput
  });

  // ---------------------------------------------------------------------------
  // UNIFIED BRAIN OUTPUT — returned to Splendor's main response handler.
  // Carries the final response plus every region's output for transparency.
  // ---------------------------------------------------------------------------
  return {
    // The actionable result for the response handler:
    responseDraft: brocaWernickeOutput.responseDraft,
    permission: prefrontalOutput.permission,
    responseIntent: prefrontalOutput.responseIntent,
    selectedTone: brocaWernickeOutput.selectedTone,
    confidence: prefrontalOutput.confidence,
    riskLevel: prefrontalOutput.riskLevel,

    // Full per-region trace (pipeline order):
    pipeline: {
      ras: rasSignal,
      hippocampus: hippocampusOutput,
      thalamus: thalamusOutput,
      amygdala: amygdalaOutput,
      cerebellum: cerebellumOutput,
      dmn: dmnOutput,
      prefrontal: prefrontalOutput,
      brocaWernicke: brocaWernickeOutput
    },

    meta: {
      brainVersion: '1.0',
      pipelineOrder: [
        'ras', 'hippocampus', 'thalamus', 'amygdala',
        'cerebellum', 'dmn', 'prefrontal', 'brocaWernicke'
      ],
      turnNumber,
      userId,
      sessionId
    }
  };
}

export default processSplendorBrainTurn;
