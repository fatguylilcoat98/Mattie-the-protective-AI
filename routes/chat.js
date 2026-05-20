/*
  Mattie — Your AI Companion · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const express = require('express');
const router = express.Router();
const { generateSplendorResponse } = require('../lib/anthropic');
const { processSplendorBrainTurn } = require('../splendor-brain');
const { getMemoriesForUser, storeMemory } = require('../lib/supabase');
const { governance } = require('../lib/claspion-governance');
const { requireAuth, requireOwner } = require('../middleware/auth');

// CLASPION middleware sits *between* Mattie's thought and her action.
// Mattie reasons normally; we ask CLASPION whether the action she has
// landed on may execute. When CLASPION_ENABLED is false, the call is a
// dormant pass-through and Mattie runs clean.
const SAFE_REFUSAL =
  "I'm holding back on this response, Sandy. My conscience flagged something that doesn't feel right. Let me know what you really need and we'll try a different approach.";

async function gateAction(thought, intent) {
  const verdict = await governance.validate({ thought, intent, actorId: 'mattie' });
  return verdict;
}

// Simple chat endpoint - just the essentials
router.post('/', requireAuth, requireOwner, async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.userId;

    console.log(`[CHAT] Processing message from ${userId}: ${message}`);

    // Get basic memories
    let memories = [];
    try {
      memories = await getMemoriesForUser(userId, 5);
    } catch (memError) {
      console.error('Memory retrieval failed:', memError);
    }

    // Mattie thinks through the full cognitive pipeline: RAS salience ->
    // Hippocampus recall -> Thalamus routing -> Amygdala affect -> Cerebellum
    // style -> DMN reflection -> Prefrontal (GNG+CLASPION) -> Broca/Wernicke
    // (Claude). The brain returns the final voice; the route-level CLASPION
    // gate below remains the outer ship-gate (defense in depth).
    let brain;
    try {
      brain = await processSplendorBrainTurn({
        userId,
        currentInput: message,
        sessionId: req.sessionId || null,
      });
    } catch (brainError) {
      console.error('[CHAT] Brain failed, falling back to direct generation:', brainError.message);
      brain = null;
    }
    const response = brain
      ? brain.response
      : await generateSplendorResponse(message, memories, false);

    if (brain && brain.meta.degradedRegions.length) {
      console.warn(`[CHAT] Brain ran degraded: ${brain.meta.degradedRegions.join(', ')}`);
    }
    console.log(`[CHAT] Response generated successfully`);

    // CLASPION sits between thought and action: validate the
    // send-response action before it ships. Toggleable via
    // CLASPION_ENABLED; dormant call is a no-op pass-through.
    const verdict = await gateAction(
      {
        user_message: message,
        generated_response: response,
        memory_count: memories.length,
      },
      {
        type: 'send_chat_response',
        target: userId,
        domain: 'conversation',
      },
    );

    if (!verdict.allow) {
      // Action blocked. Tell the user, log the verdict, do NOT store
      // the suppressed thought as memory.
      console.warn(
        `[CHAT] CLASPION blocked send_chat_response: decision=${verdict.decision} reason="${verdict.reason}" corr=${verdict.correlation_id}`,
      );
      res.status(200).json({
        message: SAFE_REFUSAL,
        timestamp: new Date().toISOString(),
        governance: {
          decision: verdict.decision,
          basis_state: verdict.basis_state,
          conscience: verdict.conscience_name,
          verdict_id: verdict.verdict_id,
          correlation_id: verdict.correlation_id,
        },
      });
      return;
    }

    // Send response immediately — don't make the user wait for memory writes.
    res.json({
      message: response,
      timestamp: new Date().toISOString(),
      governance: {
        decision: verdict.decision,
        basis_state: verdict.basis_state,
        conscience: verdict.conscience_name,
        verdict_id: verdict.verdict_id,
        correlation_id: verdict.correlation_id,
        dormant: !!verdict.dormant,
      },
      brain: brain
        ? {
            version: brain.meta.brainVersion,
            permission: brain.permission,
            confidence: brain.confidence,
            riskLevel: brain.riskLevel,
            degradedRegions: brain.meta.degradedRegions,
            generatedBy: brain.meta.generatedBy,
          }
        : { version: 'fallback', note: 'brain unavailable; direct generation used' },
    });

    // Fire-and-forget memory writes after the response has been sent.
    // Errors are logged but never delay the user-visible reply.
    storeMemory(userId, `User: ${message}`, 'shared_history')
      .catch((e) => console.error('Memory storage (user) failed:', e.message));
    storeMemory(userId, `Mattie: ${response}`, 'shared_history')
      .catch((e) => console.error('Memory storage (assistant) failed:', e.message));

  } catch (error) {
    console.error('[CHAT] Error:', error);
    res.status(500).json({
      error: error.message || 'Unable to process your message'
    });
  }
});

// Simple streaming endpoint
router.post('/stream', requireAuth, requireOwner, async (req, res) => {
  const { message } = req.body;
  const userId = req.userId;

  try {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // Get memories
    let memories = [];
    try {
      memories = await getMemoriesForUser(userId, 5);
    } catch (memError) {
      console.error('Memory error:', memError);
    }

    // Generate response through the full cognitive pipeline (same brain as
    // the non-streaming path); fall back to direct generation on failure.
    let brain;
    try {
      brain = await processSplendorBrainTurn({
        userId,
        currentInput: message || '',
        sessionId: req.sessionId || null,
      });
    } catch (brainError) {
      console.error('[STREAM] Brain failed, falling back to direct generation:', brainError.message);
      brain = null;
    }
    const response = brain
      ? brain.response
      : await generateSplendorResponse(message || '', memories, false);

    // Gate the response through CLASPION before any token leaves the wire.
    const verdict = await gateAction(
      {
        user_message: message || '',
        generated_response: response,
        memory_count: memories.length,
        stream: true,
      },
      {
        type: 'send_chat_response',
        target: userId,
        domain: 'conversation',
      },
    );

    const finalText = verdict.allow ? response : SAFE_REFUSAL;
    if (!verdict.allow) {
      console.warn(
        `[STREAM] CLASPION blocked send_chat_response: decision=${verdict.decision} reason="${verdict.reason}" corr=${verdict.correlation_id}`,
      );
    }

    // Send as simulated streaming (word by word)
    const words = finalText.split(' ');
    for (let i = 0; i < words.length; i++) {
      const token = words[i] + (i < words.length - 1 ? ' ' : '');
      res.write(`data: ${JSON.stringify({ type: 'token', text: token })}\n\n`);
      await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
    }

    // Send completion
    res.write(`data: ${JSON.stringify({
      type: 'done',
      conversation_id: require('crypto').randomUUID(),
      full_response: finalText,
      governance: {
        decision: verdict.decision,
        basis_state: verdict.basis_state,
        conscience: verdict.conscience_name,
        verdict_id: verdict.verdict_id,
        correlation_id: verdict.correlation_id,
        dormant: !!verdict.dormant,
      },
    })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();

  } catch (error) {
    console.error('[STREAM] Error:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  }
});

module.exports = router;
