/*
  Mattie — Protective AI Companion for Sandy
  Built by Christopher Hughes · The Good Neighbor Guard
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// VOICE — Mattie chooses her own gentle, caring voice.
// Backed by OpenAI TTS. Uses emotional delivery instructions for
// warm, faith-centered, protective communication perfect for Sandy.

const VOICE_OPTIONS = [
  // OpenAI TTS Voices - Gentle & Caring for Sandy
  {
    id: 'nova_caring',
    name: 'Nova - Caring Friend',
    description: 'Warm, gentle, nurturing. Perfect for daily companionship and encouragement.',
    provider: 'openai',
    openai_voice: 'nova'
  },
  {
    id: 'shimmer_protective',
    name: 'Shimmer - Protective Guide',
    description: 'Soft, wise, protective. Ideal for scam warnings and gentle guidance.',
    provider: 'openai',
    openai_voice: 'shimmer'
  },
  {
    id: 'alloy_faithful',
    name: 'Alloy - Faithful Companion',
    description: 'Clear, steady, trustworthy. Perfect for prayer check-ins and daily conversations.',
    provider: 'openai',
    openai_voice: 'alloy'
  }
];

function getVoiceOption(voiceKey) {
  return VOICE_OPTIONS.find(v => v.id === voiceKey) || VOICE_OPTIONS[0];
}

function isOpenAIConfigured() {
  const configured = !!process.env.OPENAI_API_KEY;
  console.log(`[VOICE] OpenAI TTS configured: ${configured}`);
  return configured;
}

function isVoiceConfigured() {
  return isOpenAIConfigured();
}

// Infer the emotional tone of a piece of text. Returns a short
// instruction string suitable for gpt-4o-mini-tts's `instructions`
// parameter. Best-effort; falls back to a neutral instruction.
async function inferToneInstructions(text) {
  if (!text || text.length < 4) return 'Speak in a warm, present, natural tone.';
  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      system: `You read a short message that an AI named Splendor is about to speak aloud.
Output ONE short imperative sentence describing how it should be delivered — tone, pace, emotion, any laughter or sigh.
Examples:
- "Speak warmly with a small chuckle, slightly playful."
- "Speak softly and slowly, with sadness in the voice."
- "Speak firmly and steadily, no warmth, just truth."
- "Speak with bright excitement, a little faster than usual."
- "Speak in a calm, present, neutral tone."
NO preamble. NO quotes. Just one sentence.`,
      messages: [{ role: 'user', content: text.slice(0, 800) }]
    });
    const out = response.content[0].text.trim().replace(/^["']|["']$/g, '');
    return out || 'Speak in a warm, present, natural tone.';
  } catch (err) {
    console.error('inferToneInstructions error:', err.message);
    return 'Speak in a warm, present, natural tone.';
  }
}

// Synthesize speech via OpenAI gpt-4o-mini-tts. Returns a base64-encoded
// MP3 string, or null if synthesis is unavailable / fails (caller falls
// back to browser TTS).
//
// The third arg `toneInstructions` overrides the inferred tone — pass it
// when you already know what tone you want (e.g. tests, deterministic
// system messages). When omitted, tone is inferred from `text`.
async function speakResponse(text, voiceKey = 'nova_caring', toneInstructions = null) {
  const voice = getVoiceOption(voiceKey);
  console.log(`[VOICE] Attempting synthesis with voice: ${voice.name} (${voice.provider})`);

  if (!isOpenAIConfigured()) {
    console.log('OpenAI not configured - falling back to browser TTS');
    return null;
  }

  if (voice.provider !== 'openai') {
    console.log(`Voice ${voice.name} is not OpenAI - falling back to browser TTS`);
    return null;
  }

  try {
    let OpenAI;
    try {
      const openaiModule = require('openai');
      OpenAI = openaiModule.OpenAI || openaiModule.default || openaiModule;
    } catch (requireError) {
      console.log('OpenAI package not available - falling back to browser TTS');
      console.error('Import error:', requireError);
      return null;
    }

    if (!OpenAI) return null;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Infer or accept tone instructions.
    const instructions = toneInstructions || (await inferToneInstructions(text));
    console.log(`[VOICE] Tone: "${instructions}"`);

    // gpt-4o-mini-tts supports `instructions` for expressive delivery.
    // If the request 400s on `instructions` (older library), retry without it.
    let mp3;
    try {
      mp3 = await openai.audio.speech.create({
        model: 'gpt-4o-mini-tts',
        voice: voice.openai_voice,
        input: text,
        instructions,
        response_format: 'mp3'
      });
    } catch (firstErr) {
      console.warn('[VOICE] gpt-4o-mini-tts with instructions failed, retrying with tts-1:', firstErr.message);
      mp3 = await openai.audio.speech.create({
        model: 'tts-1',
        voice: voice.openai_voice,
        input: text,
        response_format: 'mp3',
        speed: 1.05
      });
    }

    const buffer = Buffer.from(await mp3.arrayBuffer());
    return buffer.toString('base64');
  } catch (err) {
    console.error('OpenAI TTS error:', err.message);
    return null;
  }
}

module.exports = {
  VOICE_OPTIONS,
  getVoiceOption,
  isOpenAIConfigured,
  isVoiceConfigured,
  speakResponse,
  inferToneInstructions
};
