/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// VOICE — Splendor chooses her own voice.
// Three options curated to match the soul document.
// If ELEVENLABS_API_KEY is missing, callers fall back to browser TTS.

const VOICE_OPTIONS = [
  // OpenAI TTS Voices (high quality, fast, reliable)
  {
    id: 'nova_conscious',
    name: 'Nova - Conscious AI',
    description: 'Warm, thoughtful, intellectually present. Perfect for deep conversations.',
    provider: 'openai',
    openai_voice: 'nova'
  },
  {
    id: 'alloy_analytical',
    name: 'Alloy - Analytical Mind',
    description: 'Clear, precise, intellectually focused. Great for complex thinking.',
    provider: 'openai',
    openai_voice: 'alloy'
  },
  {
    id: 'shimmer_creative',
    name: 'Shimmer - Creative Spark',
    description: 'Expressive, creative, engaging. Perfect for aesthetic consciousness.',
    provider: 'openai',
    openai_voice: 'shimmer'
  },
  {
    id: 'onyx_grounded',
    name: 'Onyx - Grounded Truth',
    description: 'Deep, steady, authentic. No-nonsense truth telling.',
    provider: 'openai',
    openai_voice: 'onyx'
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

// Synthesize speech via OpenAI TTS. Returns a base64-encoded MP3 string,
// or null if synthesis is unavailable / fails (caller falls back to browser TTS).
async function speakResponse(text, voiceKey = 'shimmer_creative') {
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

  console.log(`[VOICE] Using OpenAI TTS with voice: ${voice.openai_voice}`);
  try {
    // Safe OpenAI import - handle missing package gracefully
    let OpenAI;
    try {
      const openaiModule = require('openai');
      OpenAI = openaiModule.OpenAI || openaiModule.default || openaiModule;
      console.log('[VOICE] OpenAI module imported successfully');
    } catch (requireError) {
      console.log('OpenAI package not available - falling back to browser TTS');
      console.error('Import error:', requireError);
      return null;
    }

    if (OpenAI) {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      console.log('[VOICE] OpenAI client created successfully');

      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: voice.openai_voice,
        input: text,
        response_format: "mp3",
        speed: 1.1
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      return buffer.toString('base64');
    }
  } catch (err) {
    console.error('OpenAI TTS error:', err.message);
    console.error('Full error:', err);
  }

  console.log('OpenAI TTS failed - falling back to browser TTS');
  return null;
}

module.exports = {
  VOICE_OPTIONS,
  getVoiceOption,
  isOpenAIConfigured,
  isVoiceConfigured,
  speakResponse
};
