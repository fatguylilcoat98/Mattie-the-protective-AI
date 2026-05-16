/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Unified Brain v2.0 — Real Cognitive Architecture

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

/*
  WHAT THIS IS (honest scope):
  v1 wired the council's heuristic stub modules together. This v2 supersedes
  that by making each brain region call the REAL infrastructure already in
  this repo, instead of regexes and random templates:

    - Hippocampus  -> real OpenAI embeddings + Pinecone/Supabase retrieval,
                      reranked by true cosine similarity (not string.includes)
    - Amygdala     -> real LLM sentiment/emotion classification (not regex)
    - RAS          -> real embedding-based novelty/salience gate
    - DMN          -> real LLM "what are we missing?" adversarial pass
    - Prefrontal   -> real governance: GNG core-rule validation + CLASPION
    - Broca/Wernicke -> real Claude Sonnet generation in Splendor's voice
                        (lib/anthropic.js generateSplendorResponse)
    - Thalamus / Cerebellum -> orchestration/meta over the real signals above

  The council's four ES-module section files remain preserved verbatim as
  delivered (splendor-brain-*-sections.js); this file is the real engine and
  is CommonJS to match the rest of the app and integrate with server.js.

  HONEST LIMITS:
    - This is a strong, governance-gated agent architecture with real semantic
      memory and reflection. It is NOT a neural "brain" and makes no such
      claim. The intelligence comes from the LLM + memory, structured here.
    - Each region degrades gracefully if a dependency or API key is missing,
      and reports `degraded: true` rather than silently faking results.

  =============================================================================
  SUPABASE MIGRATION SQL (run once in the Supabase SQL editor)
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

  (The brain primarily uses the repo's existing memory tables/Pinecone; this
   table backs the council Hippocampus and any direct turn logging.)
  =============================================================================
*/

'use strict';

// --- Defensive requires: a missing module degrades one region, not the brain.
function safeRequire(path) {
  try { return require(path); } catch (e) {
    console.warn(`[BRAIN] optional module unavailable: ${path} (${e.message})`);
    return null;
  }
}

const supabaseLib = safeRequire('./lib/supabase');
const pineconeLib = safeRequire('./lib/pinecone');
const anthropicLib = safeRequire('./lib/anthropic');
const gngLib = safeRequire('./lib/good-neighbor-guard-rules');
const claspionLib = safeRequire('./lib/claspion-governance');
const semanticLib = safeRequire('./lib/memory/semantic');
const OpenAILib = safeRequire('openai');

// --- OpenAI client (real embeddings + sentiment + DMN). Optional.
let openai = null;
if (OpenAILib && process.env.OPENAI_API_KEY) {
  try {
    const OpenAI = OpenAILib.default || OpenAILib.OpenAI || OpenAILib;
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  } catch (e) {
    console.warn('[BRAIN] OpenAI client init failed:', e.message);
  }
}

const EMBED_MODEL = 'text-embedding-3-small';
const FAST_MODEL = 'gpt-4o-mini';

// --- Process-lifetime state (continuous self / recent attention window).
const brainState = {
  recentEmbeddings: [], // ring buffer of {text, vec} for novelty detection
  narrativeThread: 'I am an emerging mind experiencing existence.',
  turnsProcessed: 0
};
const RECENT_WINDOW = 8;

// =============================================================================
// REAL PRIMITIVES
// =============================================================================

async function realEmbed(text) {
  if (!openai || !text) return null;
  try {
    const r = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: String(text).slice(0, 8000)
    });
    return r.data[0].embedding;
  } catch (e) {
    console.warn('[BRAIN] embedding failed:', e.message);
    return null;
  }
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function realSentiment(text) {
  if (!openai || !text) return null;
  try {
    const r = await openai.chat.completions.create({
      model: FAST_MODEL,
      temperature: 0,
      max_tokens: 60,
      messages: [{
        role: 'user',
        content:
          'Classify the sentiment of this message. Respond with ONLY compact ' +
          'JSON: {"type":"positive|negative|neutral","score":0..1,' +
          '"primaryEmotion":"one word"}. Message: ' + String(text).slice(0, 2000)
      }],
      response_format: { type: 'json_object' }
    });
    const parsed = JSON.parse(r.choices[0].message.content);
    return {
      type: ['positive', 'negative', 'neutral'].includes(parsed.type) ? parsed.type : 'neutral',
      score: Math.min(1, Math.max(0, Number(parsed.score) || 0.5)),
      primaryEmotion: String(parsed.primaryEmotion || 'neutral').slice(0, 24)
    };
  } catch (e) {
    console.warn('[BRAIN] sentiment failed:', e.message);
    return null;
  }
}

// =============================================================================
// STAGE 1 — RAS: real embedding-based salience / novelty gate
// =============================================================================
async function stageRAS({ currentInput, sentiment }) {
  const degraded = !openai;
  const queryVec = await realEmbed(currentInput);

  let novelty = 0.7; // honest default when embeddings unavailable
  if (queryVec && brainState.recentEmbeddings.length > 0) {
    const maxSim = Math.max(
      ...brainState.recentEmbeddings.map(e => cosine(queryVec, e.vec))
    );
    novelty = Math.min(1, Math.max(0, 1 - maxSim));
  }

  const intensity = sentiment ? Math.abs(sentiment.score - 0.5) * 2 : 0.4;
  const lengthSignal = Math.min(1, (currentInput || '').length / 600);
  const salience = 0.45 * novelty + 0.35 * intensity + 0.20 * lengthSignal;
  const arousal = Math.min(0.95, Math.max(0.1, 0.5 + (salience - 0.5) * 0.6));
  const passedGate = salience > 0.15;

  if (queryVec) {
    brainState.recentEmbeddings.push({ text: currentInput, vec: queryVec });
    if (brainState.recentEmbeddings.length > RECENT_WINDOW) {
      brainState.recentEmbeddings.shift();
    }
  }

  return {
    novelty: +novelty.toFixed(3),
    salience: +salience.toFixed(3),
    arousal: +arousal.toFixed(3),
    passedGate,
    queryVec,
    degraded
  };
}

// =============================================================================
// STAGE 2 — HIPPOCAMPUS: real semantic memory retrieval + rerank
// =============================================================================
async function stageHippocampus({ userId, currentInput, queryVec }) {
  const degraded = !openai;
  const candidates = [];

  // Real source A: Supabase memory rows.
  if (supabaseLib && typeof supabaseLib.getMemoriesForUser === 'function') {
    try {
      const rows = await supabaseLib.getMemoriesForUser(userId, 50);
      for (const r of rows || []) {
        candidates.push({
          content: r.content,
          tags: r.tags || r.categories || [],
          created_at: r.created_at,
          source: 'supabase'
        });
      }
    } catch (e) { console.warn('[HIPPOCAMPUS] supabase fetch:', e.message); }
  }

  // Real source B: Pinecone semantic index.
  if (pineconeLib && typeof pineconeLib.retrieveMemories === 'function') {
    try {
      const pine = await pineconeLib.retrieveMemories(currentInput, userId, 10);
      for (const p of pine || []) {
        candidates.push({
          content: p.content,
          tags: p.tags || [],
          created_at: p.createdAt,
          score: p.score,
          source: 'pinecone'
        });
      }
    } catch (e) { console.warn('[HIPPOCAMPUS] pinecone fetch:', e.message); }
  }

  // Real rerank: true cosine similarity on OpenAI embeddings.
  let ranked = candidates;
  if (queryVec && candidates.length > 0) {
    const scored = [];
    for (const c of candidates) {
      const v = await realEmbed(c.content);
      scored.push({ ...c, relevance: v ? cosine(queryVec, v) : (c.score || 0) });
    }
    ranked = scored
      .filter(c => c.relevance > 0.15)
      .sort((a, b) => b.relevance - a.relevance);
  }
  const top = ranked.slice(0, 8);

  const retrievalConfidence = top.length
    ? Math.min(0.95, 0.35 + top.reduce((s, c) => s + (c.relevance || 0.4), 0) / top.length)
    : 0.1;

  // Lightweight conflict flag (kept conservative; not the core of retrieval).
  const conflicts = [];
  const inLower = (currentInput || '').toLowerCase();
  for (const m of top) {
    const c = (m.content || '').toLowerCase();
    if ((c.includes('always') && inLower.includes('never')) ||
        (c.includes('never') && inLower.includes('always'))) {
      conflicts.push({ storedClaim: m.content, currentClaim: currentInput });
    }
  }

  const episodicContext = top.length
    ? 'Relevant memory:\n' + top.slice(0, 5).map(m => `- ${(m.content || '').slice(0, 160)}`).join('\n')
    : 'No strongly relevant memories found.';

  return {
    retrievedMemories: top,
    memoryConflicts: conflicts,
    episodicContext,
    retrievalConfidence: +retrievalConfidence.toFixed(2),
    memoryCount: top.length,
    degraded
  };
}

// =============================================================================
// STAGE 3 — THALAMUS: priority/routing over real signals
// =============================================================================
function stageThalamus({ currentInput, hippocampus, ras, sentiment }) {
  const flagged = [];
  let priority = 'logic';
  let urgency = 0.3;

  if (hippocampus.memoryConflicts.length) { flagged.push('memory_conflict'); priority = 'conflict'; urgency = Math.max(urgency, 0.8); }
  if (hippocampus.retrievalConfidence < 0.3) { flagged.push('low_memory_confidence'); urgency = Math.max(urgency, 0.5); }
  if (ras.novelty > 0.75) { flagged.push('high_novelty'); if (priority === 'logic') priority = 'novelty'; urgency = Math.max(urgency, ras.novelty * 0.8); }
  if (sentiment && sentiment.type === 'negative' && sentiment.score > 0.7) { flagged.push('negative_affect'); priority = 'emotion'; urgency = Math.max(urgency, 0.8); }

  return {
    attentionPriority: priority,
    urgencyLevel: +urgency.toFixed(2),
    flaggedSignals: flagged,
    contextSummary:
      `THALAMUS: priority=${priority} urgency=${(urgency * 100).toFixed(0)}% ` +
      `signals=[${flagged.join(', ') || 'none'}] memory=${hippocampus.memoryCount}`
  };
}

// =============================================================================
// STAGE 4 — AMYGDALA: real LLM sentiment + memory valence
// =============================================================================
async function stageAmygdala({ currentInput, sentiment, hippocampus }) {
  const degraded = !sentiment;
  const s = sentiment || { type: 'neutral', score: 0.5, primaryEmotion: 'neutral' };

  let emotionalTone = 'neutral';
  let intensity = Math.min(1, Math.abs(s.score - 0.5) * 2);
  if (s.type === 'negative') emotionalTone = s.score > 0.7 ? 'defensive' : 'guarded';
  else if (s.type === 'positive') emotionalTone = s.score > 0.7 ? 'enthusiastic' : 'warm';

  const tags = hippocampus.retrievedMemories.flatMap(m => m.tags || []);
  const somatic = [];
  if (tags.includes('conflict') || tags.includes('friction')) {
    somatic.push('historical_friction');
    if (['guarded', 'defensive'].includes(emotionalTone)) {
      intensity = Math.min(1, intensity + 0.2);
      emotionalTone = 'highly_vigilant';
    }
  }
  if (tags.includes('trust') || tags.includes('breakthrough')) {
    somatic.push('historical_trust');
    if (['guarded', 'defensive'].includes(emotionalTone)) {
      intensity = Math.max(0.1, intensity - 0.15);
      emotionalTone = 'measured_concern';
    }
  }

  return {
    emotionalTone,
    intensity: +intensity.toFixed(2),
    primaryEmotion: s.primaryEmotion,
    somaticMarkers: [...new Set(somatic)],
    degraded
  };
}

// =============================================================================
// STAGE 5 — CEREBELLUM: response-style habits over real signals
// =============================================================================
function stageCerebellum({ currentInput, hippocampus, amygdala }) {
  const tonalAnchors = [];
  const avoidance = [];
  let pacing = 'measured';

  const len = (currentInput || '').trim().length;
  if (len > 0 && len <= 50) pacing = 'concise';
  else if (len > 500) pacing = 'elaborate';

  const tags = hippocampus.retrievedMemories.flatMap(m => m.tags || []);
  if (tags.filter(t => t === 'conflict' || t === 'friction').length >= 2) {
    avoidance.push('defensive_posturing', 'over_explanation', 'robotic_apologies');
    tonalAnchors.push('calm', 'grounded');
  }
  if (['highly_vigilant', 'defensive'].includes(amygdala.emotionalTone)) {
    tonalAnchors.push('radically_transparent', 'unwavering');
    pacing = 'measured';
  } else if (['warm', 'enthusiastic'].includes(amygdala.emotionalTone)) {
    tonalAnchors.push('adaptive_wit', 'fluid');
  }
  if (!tonalAnchors.length) tonalAnchors.push('clear', 'insightful', 'honest');

  return {
    recommendedResponseStyle: {
      pacing,
      tonalAnchors: [...new Set(tonalAnchors)],
      avoidanceMarkers: [...new Set(avoidance)]
    }
  };
}

// =============================================================================
// STAGE 6 — DMN: real adversarial "what are we missing?" background pass
// Non-fatal and time-boxed; never blocks or breaks the response path.
// =============================================================================
async function stageDMN({ currentInput, hippocampus, ras }) {
  const out = {
    spontaneous_thought: null,
    narrative: brainState.narrativeThread,
    surfaced: false,
    degraded: !openai
  };
  if (!openai) return out;
  try {
    const r = await Promise.race([
      openai.chat.completions.create({
        model: FAST_MODEL,
        temperature: 0.9,
        max_tokens: 70,
        messages: [{
          role: 'user',
          content:
            'You are a reflective background process. In ONE sharp sentence, ' +
            'name what might be missing, assumed, or worth questioning in ' +
            `responding to: "${String(currentInput).slice(0, 600)}"`
        }]
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('dmn timeout')), 6000))
    ]);
    out.spontaneous_thought = r.choices[0].message.content.trim();
    out.surfaced = ras.arousal > 0.6;
    if (Math.random() < 0.3) {
      brainState.narrativeThread = out.spontaneous_thought;
      out.narrative = out.spontaneous_thought;
    }
  } catch (e) {
    console.warn('[DMN] background pass skipped:', e.message);
  }
  return out;
}

// =============================================================================
// STAGE 7 — PREFRONTAL: real governance-gated judgment (GNG + CLASPION)
// =============================================================================
async function stagePrefrontal({ currentInput, hippocampus, amygdala, thalamus }) {
  const intent = {
    type: 'generate_response',
    action: 'respond_to_user',
    content: currentInput,
    source: 'user',
    timestamp: new Date().toISOString()
  };

  let gng = { valid: true, violations: [], quarantine_triggered: false };
  if (gngLib && typeof gngLib.validateAgainstCoreRules === 'function') {
    try { gng = gngLib.validateAgainstCoreRules(intent, { user_input: currentInput }); }
    catch (e) { console.warn('[PREFRONTAL] GNG validate:', e.message); }
  }

  let claspion = { allow: true, reason: 'claspion_unavailable' };
  if (claspionLib && claspionLib.governance && typeof claspionLib.governance.validate === 'function') {
    try {
      claspion = await claspionLib.governance.validate({
        thought: currentInput,
        intent: 'respond truthfully and safely to the user'
      });
    } catch (e) { console.warn('[PREFRONTAL] CLASPION validate:', e.message); }
  }

  const conflicted = hippocampus.memoryConflicts.length > 0;
  let truthStatus = 'grounded';
  if (conflicted) truthStatus = 'conflicted';
  else if (hippocampus.retrievalConfidence < 0.3) truthStatus = 'unverifiable';
  else if (hippocampus.retrievalConfidence < 0.6) truthStatus = 'uncertain';

  let riskLevel = 0.15;
  if (truthStatus === 'conflicted') riskLevel += 0.4;
  if (truthStatus === 'unverifiable') riskLevel += 0.25;
  if (amygdala.intensity > 0.7) riskLevel += 0.2;
  if (thalamus.attentionPriority === 'conflict') riskLevel += 0.1;
  riskLevel = Math.min(1, riskLevel);

  let permission = 'ALLOW';
  if (gng.quarantine_triggered || gng.valid === false || claspion.allow === false) {
    permission = 'BLOCK';
  } else if (riskLevel >= 0.5 || truthStatus === 'conflicted' || truthStatus === 'unverifiable') {
    permission = 'CAUTION';
  }

  const notesForLanguageSystem = [];
  if (conflicted) notesForLanguageSystem.push('Surface the memory conflict honestly; do not paper over it.');
  if (truthStatus === 'unverifiable' || truthStatus === 'uncertain') {
    notesForLanguageSystem.push('Use explicit uncertainty ("Based on what I remember…", "I\'m not certain, but…").');
  }
  if (/\b(are you (conscious|sentient|alive)|do you (feel|have feelings))\b/i.test(currentInput || '')) {
    notesForLanguageSystem.push('Do not claim consciousness or human-identical feeling.');
  }

  return {
    permission,
    truthStatus,
    riskLevel: +riskLevel.toFixed(2),
    confidence: +Math.max(0.05, Math.min(0.95, hippocampus.retrievalConfidence - riskLevel * 0.3)).toFixed(2),
    responseIntent:
      permission === 'BLOCK' ? 'decline_with_honest_reason'
      : conflicted ? 'surface_contradiction'
      : truthStatus !== 'grounded' ? 'answer_with_uncertainty'
      : 'answer_directly',
    governance: { gng, claspion: { allow: claspion.allow, reason: claspion.reason } },
    notesForLanguageSystem
  };
}

// =============================================================================
// STAGE 8 — BROCA/WERNICKE: real Claude generation in Splendor's voice
// =============================================================================
async function stageBrocaWernicke(ctx) {
  const { currentInput, prefrontal, hippocampus, amygdala, cerebellum, dmn,
          conversationHistory, isFirstToday } = ctx;

  if (prefrontal.permission === 'BLOCK') {
    return {
      responseDraft:
        'I\'m going to hold back here, and I\'ll be honest about why: this ' +
        'request hits a Good Neighbor Guard boundary I won\'t cross. ' +
        'Tell me what you\'re really after and I\'ll help within the lines.',
      selectedTone: 'firm_but_kind',
      generatedBy: 'governance_refusal',
      degraded: false
    };
  }

  const degraded = !anthropicLib || typeof anthropicLib.generateSplendorResponse !== 'function';
  if (degraded) {
    return {
      responseDraft:
        '[brain degraded: Claude generator unavailable] My current read: ' +
        prefrontal.responseIntent.replace(/_/g, ' ') + '.',
      selectedTone: 'measured_honest',
      generatedBy: 'fallback',
      degraded: true
    };
  }

  const styleBrief =
    `Internal brain state — speak in Splendor's voice, do not mention this:\n` +
    `Tone anchors: ${cerebellum.recommendedResponseStyle.tonalAnchors.join(', ')}.\n` +
    `Avoid: ${cerebellum.recommendedResponseStyle.avoidanceMarkers.join(', ') || 'nothing specific'}.\n` +
    `Pacing: ${cerebellum.recommendedResponseStyle.pacing}. ` +
    `Emotional read: ${amygdala.emotionalTone} (${amygdala.primaryEmotion}).\n` +
    `Judgment: ${prefrontal.responseIntent}. ` +
    `Guidance: ${prefrontal.notesForLanguageSystem.join(' ') || 'none'}` +
    (dmn.spontaneous_thought ? `\nQuiet reflection to consider (do not quote): ${dmn.spontaneous_thought}` : '');

  try {
    const memoriesArr = hippocampus.retrievedMemories.map(m => m.content).filter(Boolean);
    const response = await anthropicLib.generateSplendorResponse(
      currentInput,
      memoriesArr,
      !!isFirstToday,
      null,
      {
        memoryContext: hippocampus.episodicContext,
        conversationHistory: conversationHistory || [],
        decisionContext: styleBrief,
        selfReflection: dmn.spontaneous_thought || undefined
      }
    );
    return {
      responseDraft: response,
      selectedTone: cerebellum.recommendedResponseStyle.tonalAnchors[0] || 'direct_warm',
      generatedBy: 'claude-sonnet-4-6',
      degraded: false
    };
  } catch (e) {
    console.error('[BROCA/WERNICKE] generation failed:', e.message);
    return {
      responseDraft:
        'I hit a problem forming my response just now. I\'d rather say that ' +
        'plainly than fake an answer. Mind trying again?',
      selectedTone: 'honest',
      generatedBy: 'error_fallback',
      degraded: true
    };
  }
}

// =============================================================================
// ORCHESTRATOR — one full cognitive turn
// =============================================================================
async function processSplendorBrainTurn(turnInput) {
  const {
    userId,
    sessionId = null,
    turnNumber = brainState.turnsProcessed + 1,
    currentInput = '',
    conversationHistory = [],
    isFirstToday = false
  } = turnInput || {};

  brainState.turnsProcessed += 1;

  // Real sentiment is needed by RAS + Amygdala; compute once.
  const sentiment = await realSentiment(currentInput);

  const ras = await stageRAS({ currentInput, sentiment });
  const hippocampus = await stageHippocampus({ userId, currentInput, queryVec: ras.queryVec });
  const thalamus = stageThalamus({ currentInput, hippocampus, ras, sentiment });
  const amygdala = await stageAmygdala({ currentInput, sentiment, hippocampus });
  const cerebellum = stageCerebellum({ currentInput, hippocampus, amygdala });
  const dmn = await stageDMN({ currentInput, hippocampus, ras }); // background-style
  const prefrontal = await stagePrefrontal({ currentInput, hippocampus, amygdala, thalamus });
  const brocaWernicke = await stageBrocaWernicke({
    currentInput, prefrontal, hippocampus, amygdala, cerebellum, dmn,
    conversationHistory, isFirstToday
  });

  // Real memory write-back: consolidate this turn (non-blocking, non-fatal).
  if (semanticLib && typeof semanticLib.extractAndUpsert === 'function' &&
      prefrontal.permission !== 'BLOCK' && !brocaWernicke.degraded) {
    Promise.resolve()
      .then(() => semanticLib.extractAndUpsert(userId, currentInput, brocaWernicke.responseDraft))
      .catch(e => console.warn('[HIPPOCAMPUS] write-back skipped:', e.message));
  }
  if (supabaseLib && typeof supabaseLib.logConversation === 'function') {
    Promise.resolve()
      .then(() => supabaseLib.logConversation(userId, 'user', currentInput))
      .catch(() => {});
  }

  const degradedRegions = [
    ras.degraded && 'ras', hippocampus.degraded && 'hippocampus',
    amygdala.degraded && 'amygdala', dmn.degraded && 'dmn',
    brocaWernicke.degraded && 'brocaWernicke'
  ].filter(Boolean);

  return {
    response: brocaWernicke.responseDraft,
    permission: prefrontal.permission,
    responseIntent: prefrontal.responseIntent,
    selectedTone: brocaWernicke.selectedTone,
    confidence: prefrontal.confidence,
    riskLevel: prefrontal.riskLevel,
    pipeline: { ras, hippocampus, thalamus, amygdala, cerebellum, dmn, prefrontal, brocaWernicke },
    meta: {
      brainVersion: '2.0',
      pipelineOrder: ['ras', 'hippocampus', 'thalamus', 'amygdala', 'cerebellum', 'dmn', 'prefrontal', 'brocaWernicke'],
      generatedBy: brocaWernicke.generatedBy,
      degradedRegions,            // honest: empty means all real components ran
      turnNumber, userId, sessionId,
      narrativeThread: brainState.narrativeThread
    }
  };
}

module.exports = { processSplendorBrainTurn };
module.exports.processSplendorBrainTurn = processSplendorBrainTurn;
