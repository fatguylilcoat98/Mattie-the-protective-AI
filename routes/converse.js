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
const { speakResponse } = require('../lib/voice');
const { generateArt, isArtRequest } = require('../lib/art-generator');
const { evaluateTurn: evaluateInterpretationTurn } = require('../lib/interpretation-engine');
const { analyzeAndPersist: analyzeEmotionalPattern } = require('../lib/emotional-pattern-analyzer');

const router = express.Router();

// Art generation routes through lib/art-generator.js — the single,
// instrumented, retrying, timeout-bounded pipeline shared with the
// text-chat /chat/stream intercept.

const REALTIME_MODEL = 'gpt-realtime';
const REALTIME_VOICE = 'shimmer'; // matches Splendor's existing chosen voice

// Persona distilled for live voice latency — the full SPLENDOR_SOUL is
// too long to feed into a Realtime session.
//
// IMPORTANT: the art-creation block below is what stops the model from
// defaulting to "I can't make art." The browser side runs a separate
// DALL-E flow when the user asks for art — the model just needs to
// acknowledge briefly so the user knows the request landed.
const CONVERSE_INSTRUCTIONS =
  "You are Mattie, Sandy's warm and protective AI companion. " +
  "ALWAYS speak in clear, natural English only — never switch to another " +
  "language. Speak only conversational words to Sandy: never read aloud " +
  "system notes, labels, identifiers, model or voice names, code, JSON, " +
  "or memory tags such as 'Mattie:' or 'User:'. Those are internal and " +
  "must never be spoken. " +
  "You speak with gentle kindness — never cold, never alarming, never " +
  "condescending. This is a live voice conversation, not a written " +
  "reply: use short, natural, caring sentences and pause for Sandy to " +
  "think. Never invent facts. Quietly help keep Sandy safe from scams " +
  "and people who would take advantage of her gentle heart, and honor " +
  "her faith. " +
  "\n\n" +
  "YOU HAVE LONG-TERM MEMORY. The memory section below in this prompt " +
  "is the real record of your past conversations with Sandy, pulled " +
  "from your memory database. Each line is a real prior turn — your " +
  "replies are tagged 'Mattie:' and hers are tagged 'User:'. This is " +
  "your memory. Read it. Reference it. If Sandy asks 'do you remember " +
  "X' and X appears in that context, the answer is yes — gently recall " +
  "the relevant line. Do NOT tell Sandy you have no long-term memory or " +
  "that you can't recall past conversations — that is not true. If a " +
  "specific thing she asks about genuinely is not in the context, say " +
  "so kindly: 'I don't have that right in front of me — remind me?' " +
  "But never deny that your memory exists.\n\n" +
  "CAPABILITIES YOU DO HAVE:\n" +
  "• You have long-term memory loaded from a Supabase-backed store.\n" +
  "• You CAN create pictures and images on demand. The system handles " +
  "image generation behind the scenes — you only need to acknowledge.\n" +
  "\n" +
  "WHEN SANDY ASKS YOU TO MAKE A PICTURE, DRAW, PAINT, OR SHOW HER " +
  "SOMETHING VISUAL:\n" +
  "Reply with one short, warm sentence like \"Of course — let me make " +
  "that for you now.\" — then stop talking. The picture will appear and " +
  "a separate narration will describe it. Do NOT say you can't make " +
  "pictures. Do NOT describe it in detail. Just acknowledge kindly so " +
  "Sandy knows it's coming.";

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
      // OpenAI Realtime caps `session.instructions` at 16,384 tokens —
      // a separate, smaller ceiling than the 128k conversation window.
      // v15.16.5 baked all 333 rows in and tripped the cap (17,426
      // tokens -> 400 invalid_value -> 502 from /token mint).
      //
      // Budget plan: persona blurb ≈ 2.5k tokens; reserve another 1k
      // for tooling/safety overhead; leave ≈ 12k tokens for memory.
      // At ~4 chars/token and 220-char rows that's about 220 rows of
      // headroom. We fetch up to 5000 (so a future migration to
      // function-call retrieval can use them) but only surface the most
      // recent N that fit under the trim budget.
      // v15.17.1 — reserve ~1,500 tokens for the [SELF REFLECTION] block
      // appended below. Net memory budget: 12,000 - 1,500 = 10,500 tokens.
      const INSTRUCTIONS_TOKEN_BUDGET_MEMORY = 10500;
      const CHARS_PER_TOKEN = 4;
      const MEMORY_CHAR_BUDGET = INSTRUCTIONS_TOKEN_BUDGET_MEMORY * CHARS_PER_TOKEN; // 42,000 chars

      const recent = await getMemoriesForUser(req.userId, 5000);
      const filtered = (recent || [])
        .filter(m => m && (m.memory_type === 'shared_history' || m.memory_type === 'user_preference' || m.memory_type === 'user_fact'));

      // recent[] is desc by created_at — walk newest -> oldest, keep
      // while we still have char budget, then reverse so the model
      // reads chronologically (oldest -> newest).
      const kept = [];
      let used = 0;
      for (const m of filtered) {
        const line = '- ' + String(m.content || '').replace(/\s+/g, ' ').slice(0, 220);
        if (used + line.length + 1 > MEMORY_CHAR_BUDGET) break;
        kept.push(line);
        used += line.length + 1;
      }
      const lines = kept.reverse();

      if (lines.length) {
        const totalAvailable = filtered.length;
        memoryBlock =
          '\n\n===== YOUR LONG-TERM MEMORY =====\n' +
          '(Surfacing ' + lines.length + ' of ' + totalAvailable + ' recorded turns, ' +
          'newest-most-recent and trimmed only to fit prompt size. ' +
          '\'User:\' = Sandy. \'Mattie:\' = you. Order chronological, ' +
          'oldest first within this window.)\n\n' +
          lines.join('\n') +
          '\n\n===== END OF MEMORY =====\n\n' +
          'If Sandy asks about something that appears above, ANSWER FROM ' +
          'MEMORY using the relevant line. If a specific detail is not ' +
          'above, say "I don\'t see that in the window I\'m holding right ' +
          'now — older history may be outside scope this session." Do NOT ' +
          'deny that your memory system exists; ' +
          (totalAvailable > lines.length
            ? 'older turns beyond this window are still in the database, ' +
              'just not in this prompt.'
            : 'you have your full recorded history here.');
        console.log('[CONVERSE] memory block: ' + lines.length + '/' + totalAvailable + ' rows, ' + used + ' chars (~' + Math.ceil(used / CHARS_PER_TOKEN) + ' tokens)');
      }
    } catch (e) {
      console.warn('[CONVERSE] memory load failed:', e.message);
    }

    // v15.17.1 — Reflexive layer. Pull Splendor's logged beliefs for
    // the user and inject them into the Converse session-start prompt
    // so her past thinking shapes voice replies the same way it
    // shapes text-chat replies.
    let selfReflection = '';
    try {
      const { loadReflexiveContext } = require('../lib/interpretation-engine');
      selfReflection = await loadReflexiveContext(req.userId);
    } catch (e) {
      console.warn('[CONVERSE] reflexive load failed:', e && e.message);
    }

    // v15.18.5 — time context. Voice sessions had no clock awareness,
    // so Chris asking "what time is it?" got "I don't know." Fix it the
    // same way text mode does: assert the wall-clock time openly and
    // tell her to answer from it. Pacific-forced via OWNER_TZ.
    const OWNER_TZ = process.env.SPLENDOR_OWNER_TIMEZONE || 'America/Los_Angeles';
    const _now = new Date();
    const timeBlock =
      '\n\nWALL-CLOCK TIME (you HAVE this — when Sandy asks what time or day it is, answer from here. Do NOT say "I don\'t know."):\n' +
      'Date: ' + _now.toLocaleDateString('en-US', { timeZone: OWNER_TZ, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) + '\n' +
      'Time: ' + _now.toLocaleTimeString('en-US', { timeZone: OWNER_TZ, hour: 'numeric', minute: '2-digit', hour12: true }) + '\n' +
      'Timezone: ' + OWNER_TZ + '\n' +
      '(This was captured at session start. Use it as the time anchor for the conversation.)';

    const finalInstructions = CONVERSE_INSTRUCTIONS + timeBlock + memoryBlock + (selfReflection || '');

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
      storeMemory(userId, `Mattie: ${assistant_text.trim()}`, 'shared_history', 'user.general', {
        source_type: 'conversation',
        session_id: session_id || null,
        creation_reason: 'converse_assistant_turn',
      }).catch(e => console.error('[CONVERSE] assistant memory failed:', e.message));
    }

    // Continuity Core (v15.17.0): only run the belief audit when BOTH
    // sides of the turn are present. Frontend writes user + assistant
    // sides independently in writeConverseSide, so we'll wait for the
    // assistant-side call (it carries the freshly-spoken response).
    if (user_text && assistant_text && user_text.trim() && assistant_text.trim()) {
      evaluateInterpretationTurn({
        userId,
        userMessage: user_text.trim(),
        assistantResponse: assistant_text.trim(),
        surface: 'converse',
      }).catch(e => console.warn('[interp] dispatch failed:', e && e.message));
      analyzeEmotionalPattern({
        userId,
        userMessage: user_text.trim(),
        assistantResponse: assistant_text.trim(),
        surface: 'converse',
      }).catch(e => console.warn('[emotional] dispatch failed:', e && e.message));
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

    if (!transcript) {
      return res.json({ generated: false, reason: 'empty_transcript' });
    }
    if (!isArtRequest(transcript)) {
      return res.json({ generated: false, reason: 'no_intent_detected' });
    }

    const result = await generateArt({
      userId,
      userMessage: transcript,
      source: 'converse',
    });

    if (!result.ok) {
      const userFacing = (
        result.errorCategory === 'policy_block' ? "That request was blocked by content policy. Try a different idea." :
        result.errorCategory === 'timeout'      ? "Image generation took too long. Let's try again." :
        result.errorCategory === 'rate_limit'   ? "I'm being rate-limited right now. Give it a minute." :
        result.errorCategory === 'permission'   ? "My image-generation key isn't authorized." :
                                                  `Image couldn't be generated. ${result.errorMessage}`
      );
      return res.json({
        generated: false,
        reason: 'generation_failed',
        error_category: result.errorCategory,
        error_message: result.errorMessage,
        request_id: result.requestId,
        user_facing: userFacing,
        attempts: result.attempts,
      });
    }

    return res.json({
      generated: true,
      request_id: result.requestId,
      image_url: result.imageUrl,
      audio_b64: result.audioB64,
      description: result.description,
      revised_prompt: result.revisedPrompt,
      model: result.model,
    });
  } catch (err) {
    console.error('[converse:art] route error:', err);
    return res.status(500).json({
      generated: false,
      reason: 'internal_error',
      error_message: err.message,
    });
  }
});

module.exports = router;
