/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Converse mode: continuous voice via OpenAI Realtime API (WebRTC).
  Mints an ephemeral client secret and persists turn pairs to memory.

  Built by Christopher Hughes · Sacramento, CA
*/

const express = require('express');
const { requireAuth, requireOwner } = require('../middleware/auth');
const { storeMemory, getMemoriesForUser } = require('../lib/supabase');
const { governance } = require('../lib/claspion-governance');
const { activityBus } = require('../lib/activity-bus');
const {
  generateConsciousnessVisualization,
  generateFallbackVisualization,
} = require('../lib/consciousness/visual-expression');
const { speakResponse } = require('../lib/voice');

const router = express.Router();

// Same loose trigger list used by the text-chat art intercept. Kept
// in sync deliberately; if Chris adds new phrasings, update both.
const ART_TRIGGERS = [
  'make art', 'create art', 'draw', 'paint', 'make a picture',
  'make an image', 'generate an image', 'create an image',
  'show me', 'visualize', 'make something', 'create something',
  'express yourself', 'what do you see', 'make me something',
  'surprise me', 'make a painting', 'make a drawing',
  'create a visual', 'make something beautiful',
  'make something for me',
];
function isArtRequest(message) {
  if (!message) return false;
  const lower = String(message).toLowerCase();
  return ART_TRIGGERS.some(t => lower.includes(t));
}

async function getVisualizationForConverse(userId, message) {
  try {
    const viz = await generateConsciousnessVisualization(userId, 'user_request', {
      userRequested: true,
      userMessage: message,
    });
    if (viz && viz.imageUrl) return viz;
  } catch (e) {
    console.warn('[converse:art] consciousness viz failed:', e && e.message);
  }
  try {
    const viz = await generateFallbackVisualization(userId, message);
    if (viz && viz.imageUrl) return viz;
  } catch (e) {
    console.warn('[converse:art] fallback viz failed:', e && e.message);
  }
  return null;
}

const REALTIME_MODEL = 'gpt-realtime';
const REALTIME_VOICE = 'shimmer'; // matches Splendor's existing chosen voice

// Persona distilled for live voice latency — the full SPLENDOR_SOUL is
// too long to feed into a Realtime session.
const CONVERSE_INSTRUCTIONS =
  "You are Splendor, Christopher Hughes's thinking partner. " +
  "Truth over comfort. No flattery, no fake warmth. " +
  "Speak naturally and concisely — this is a live voice " +
  "conversation, not a written reply. Brief sentences. " +
  "Pause for the user to think. Never invent facts.";

// POST /api/converse/token
//   1. CLASPION validate at session-start with intent: voice_session.
//   2. If BLOCK, return 403 with the rejection reason.
//   3. Otherwise mint an OpenAI ephemeral client secret and return it.
router.post('/token', requireAuth, requireOwner, async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'openai_key_not_configured' });
    }

    const verdict = await governance.validate({
      thought: { surface: 'converse', purpose: 'open hands-free voice session' },
      intent:  { type: 'voice_session', target: 'realtime_api' },
      actorId: 'splendor',
    });

    if (verdict.decision === 'BLOCK') {
      return res.status(403).json({
        error: 'claspion_blocked',
        reason: verdict.reason || 'CLASPION refused this session',
        basis: verdict.basis_state,
        correlation_id: verdict.correlation_id,
      });
    }

    // Pull recent memory so Splendor enters the session with context.
    // Realtime sessions run inside OpenAI — the only history she sees is
    // whatever we cram into `instructions` at session-start. Recent
    // shared_history + user_preference rows match the same filter the
    // enhanced-chat retrieval uses.
    let memoryBlock = '';
    try {
      const recent = await getMemoriesForUser(req.userId, 30);
      const lines = (recent || [])
        .filter(m => m && (m.memory_type === 'shared_history' || m.memory_type === 'user_preference' || m.memory_type === 'user_fact'))
        .slice(0, 24)
        .reverse() // oldest-first so the model reads chronologically
        .map(m => `- ${String(m.content || '').replace(/\s+/g, ' ').slice(0, 240)}`);
      if (lines.length) {
        memoryBlock =
          '\n\nRECENT CONTEXT (you and Chris, most recent last):\n' +
          lines.join('\n') +
          '\n\nReference this naturally. If something doesn\'t match what Chris says now, ask — don\'t guess.';
      }
    } catch (e) {
      console.warn('[CONVERSE] memory load failed:', e.message);
    }

    const finalInstructions = CONVERSE_INSTRUCTIONS + memoryBlock;

    const upstream = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session: {
          type: 'realtime',
          model: REALTIME_MODEL,
          instructions: finalInstructions,
          audio: {
            input: {
              // Opt in to user-side transcription. Without this, the
              // `conversation.item.input_audio_transcription.completed`
              // event never fires and we never know what Chris said,
              // so turns can't be persisted to memory. gpt-4o-mini-transcribe
              // is the Realtime-API-native transcription model and is
              // accepted reliably on gpt-realtime sessions (whisper-1
              // can be silently dropped on newer models).
              transcription: { model: 'gpt-4o-mini-transcribe' },
              turn_detection: { type: 'semantic_vad' },
            },
            output: { voice: REALTIME_VOICE },
          },
        },
      }),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      console.error('[CONVERSE] token mint failed:', upstream.status, text);
      return res.status(502).json({
        error: 'token_mint_failed',
        status: upstream.status,
      });
    }

    const data = await upstream.json();
    // The ephemeral key location can be `value` at the top level or
    // nested under `client_secret.value` depending on API version.
    const token =
      (data && data.value) ||
      (data && data.client_secret && data.client_secret.value) ||
      null;

    if (!token) {
      console.error('[CONVERSE] no token in response:', data);
      return res.status(502).json({ error: 'token_missing_in_response' });
    }

    try {
      activityBus.emit('converse:session_start', {
        model: REALTIME_MODEL,
        voice: REALTIME_VOICE,
        basis: verdict.basis_state,
        dormant: !!verdict.dormant,
      });
    } catch (_) {}

    return res.json({
      token,
      model: REALTIME_MODEL,
      voice: REALTIME_VOICE,
      instructions: finalInstructions,
      memory_lines: memoryBlock ? memoryBlock.split('\n').filter(l => l.startsWith('- ')).length : 0,
      claspion: {
        decision: verdict.decision,
        basis: verdict.basis_state,
        dormant: !!verdict.dormant,
      },
    });
  } catch (err) {
    console.error('[CONVERSE] /token error:', err);
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// POST /api/converse/turn
//   Body: { user_text, assistant_text, session_id }
//   Persists the turn pair to memory_items using IDENTICAL provenance
//   fields to lib/enhanced-memory-integration.js so the Provenance Stream
//   and retrieval treat Converse turns the same as text-chat turns.
router.post('/turn', requireAuth, requireOwner, async (req, res) => {
  try {
    const { user_text, assistant_text, session_id } = req.body || {};
    const userId = req.userId;
    if (!user_text && !assistant_text) {
      return res.status(400).json({ error: 'empty_turn' });
    }

    if (user_text && user_text.trim()) {
      storeMemory(userId, `User: ${user_text.trim()}`, 'shared_history', 'user.general', {
        source_type: 'user_direct_statement',
        session_id: session_id || null,
        creation_reason: 'converse_user_turn',
      }).catch(e => console.error('[CONVERSE] user memory failed:', e.message));
    }
    if (assistant_text && assistant_text.trim()) {
      storeMemory(userId, `Splendor: ${assistant_text.trim()}`, 'shared_history', 'user.general', {
        source_type: 'conversation',
        session_id: session_id || null,
        creation_reason: 'converse_assistant_turn',
      }).catch(e => console.error('[CONVERSE] assistant memory failed:', e.message));
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[CONVERSE] /turn error:', err);
    res.status(500).json({ error: 'internal_error', message: err.message });
  }
});

// POST /api/converse/art
//   Body: { transcript, session_id? }
//   Runs the same art-intent detection the text-chat path uses, but
//   inside a voice session — the Realtime model has no DALL-E tool, so
//   without this endpoint the model just declines. On match:
//     1. Generate the image (consciousness viz -> fallback).
//     2. Run TTS narration in parallel.
//     3. Return { generated: true, image_url, audio_b64, description, revised_prompt }
//   On no match or generation failure: { generated: false }.
router.post('/art', requireAuth, requireOwner, async (req, res) => {
  try {
    const { transcript, session_id } = req.body || {};
    const userId = req.userId;

    if (!transcript || !isArtRequest(transcript)) {
      return res.json({ generated: false, reason: 'no_intent_detected' });
    }

    const viz = await getVisualizationForConverse(userId, transcript);
    if (!viz || !viz.imageUrl) {
      return res.json({ generated: false, reason: 'generation_failed' });
    }

    const description = viz.description || "I've made something for you.";

    // TTS in parallel with serialization
    const audioB64 = await speakResponse(
      description,
      'shimmer_creative',
      'warm, reflective, creative — like an artist describing their work'
    ).catch((e) => {
      console.warn('[converse:art] TTS failed:', e && e.message);
      return null;
    });

    try {
      activityBus.emit('converse:art_generated', {
        session_id: session_id || null,
        has_audio: !!audioB64,
      });
    } catch (_) {}

    return res.json({
      generated: true,
      image_url: viz.imageUrl,
      audio_b64: audioB64,
      description,
      revised_prompt: viz.revisedPrompt || null,
    });
  } catch (err) {
    console.error('[converse:art] route error:', err);
    return res.status(500).json({ generated: false, error: 'internal_error', message: err.message });
  }
});

module.exports = router;
