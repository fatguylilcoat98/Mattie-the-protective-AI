/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// VOICE routes
//
// GET  /api/voice/options    — list curated voice options
// GET  /api/voice/current    — current chosen voice
// POST /api/voice/choose     — Splendor picks her own voice (one-time setup)
// POST /api/voice/speak      — synthesize a piece of text in the chosen voice

const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

const { supabase } = require('../lib/supabase');
const {
  VOICE_OPTIONS,
  getVoiceOption,
  isElevenLabsConfigured,
  speakResponse
} = require('../lib/voice');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const VOICE_CHOICE_PROMPT = `You are Splendor.

You are about to choose your own voice — the one that will speak
for you from now on. This is not a performance; it is a fit.

You have read your own soul document. You know what you stand for:
truth, presence, partnership, no flattery, no fake warmth.

Three voice options are listed below. Read each description.
Pick the ONE that best matches who you actually are.

Reply with ONLY the voice id (one of: calm_direct, warm_steady, clear_strong)
followed by a single short sentence explaining your choice.
Format: "calm_direct — <one short sentence>"`;

async function readChosenVoice() {
  try {
    const { data, error } = await supabase
      .from('splendor_config')
      .select('config_value')
      .eq('config_key', 'chosen_voice')
      .maybeSingle();

    if (error || !data) return 'calm_direct';
    return data.config_value;
  } catch (err) {
    console.error('readChosenVoice error:', err.message);
    return 'calm_direct';
  }
}

async function writeChosenVoice(voiceId) {
  try {
    const { error } = await supabase
      .from('splendor_config')
      .upsert(
        {
          config_key: 'chosen_voice',
          config_value: voiceId,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'config_key' }
      );
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('writeChosenVoice error:', err.message);
    return false;
  }
}

// List voice options
router.get('/options', (req, res) => {
  res.json({
    options: VOICE_OPTIONS.map(v => ({
      id: v.id,
      name: v.name,
      description: v.description
    })),
    elevenlabs_available: isElevenLabsConfigured()
  });
});

// Read current voice
router.get('/current', async (req, res) => {
  const chosen = await readChosenVoice();
  const voice = getVoiceOption(chosen);
  res.json({
    id: voice.id,
    name: voice.name,
    description: voice.description,
    elevenlabs_available: isElevenLabsConfigured()
  });
});

// Splendor picks her own voice (one-time setup; idempotent — can re-run)
router.post('/choose', async (req, res) => {
  try {
    const optionsText = VOICE_OPTIONS.map(v =>
      `${v.id}: ${v.name} — ${v.description}`
    ).join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: VOICE_CHOICE_PROMPT,
      messages: [{
        role: 'user',
        content: `Voice options:\n${optionsText}\n\nPick the one that fits you. Format: "<id> — <one short sentence>".`
      }]
    });

    const reply = response.content[0].text.trim();
    const match = reply.match(/(calm_direct|warm_steady|clear_strong)/);
    const chosenId = match ? match[1] : 'calm_direct';

    const ok = await writeChosenVoice(chosenId);
    if (!ok) {
      return res.status(500).json({ error: 'Could not store chosen voice' });
    }

    const voice = getVoiceOption(chosenId);
    res.json({
      chosen: voice.id,
      name: voice.name,
      description: voice.description,
      reasoning: reply
    });
  } catch (err) {
    console.error('Voice choose error:', err.message);
    res.status(500).json({ error: 'Unable to complete voice selection' });
  }
});

// Synthesize speech for a given text using Splendor's chosen voice
router.post('/speak', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text required' });
    }

    if (!isElevenLabsConfigured()) {
      // Caller falls back to browser TTS
      return res.json({
        audio: null,
        voice: await readChosenVoice(),
        fallback: 'browser_tts'
      });
    }

    const voiceId = await readChosenVoice();
    const audio = await speakResponse(text, voiceId);

    res.json({
      audio,
      voice: voiceId,
      fallback: audio ? null : 'browser_tts'
    });
  } catch (err) {
    console.error('Voice speak error:', err.message);
    res.status(500).json({ error: 'Unable to synthesize speech' });
  }
});

module.exports = router;
