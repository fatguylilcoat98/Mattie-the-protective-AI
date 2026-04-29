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
  },

  // ElevenLabs Voices (fallback options)
  {
    id: 'calm_direct',
    name: 'Calm & Direct (ElevenLabs)',
    description: 'Clear, grounded, no-nonsense. Warm but not soft.',
    provider: 'elevenlabs',
    elevenlabs_id: 'EXAVITQu4vr4xnSDxMaL' // Rachel
  },
  {
    id: 'warm_steady',
    name: 'Warm & Steady (ElevenLabs)',
    description: 'Present and caring. Like someone who has time for you.',
    provider: 'elevenlabs',
    elevenlabs_id: 'pNInz6obpgDQGcFmaJgB' // Adam
  }
];

function getVoiceOption(voiceKey) {
  return VOICE_OPTIONS.find(v => v.id === voiceKey) || VOICE_OPTIONS[0];
}

function isElevenLabsConfigured() {
  return !!process.env.ELEVENLABS_API_KEY;
}

function isOpenAIConfigured() {
  return !!process.env.OPENAI_API_KEY;
}

function isVoiceConfigured() {
  return isOpenAIConfigured() || isElevenLabsConfigured();
}

// Synthesize speech via OpenAI or ElevenLabs. Returns a base64-encoded MP3 string,
// or null if synthesis is unavailable / fails (caller falls back to browser TTS).
async function speakResponse(text, voiceKey = 'nova_conscious') {
  const voice = getVoiceOption(voiceKey);

  // Try OpenAI TTS first (higher quality, faster, more reliable)
  if (voice.provider === 'openai' && isOpenAIConfigured()) {
    try {
      // Safe OpenAI import - handle missing package gracefully
      let OpenAI;
      try {
        OpenAI = require('openai').OpenAI;
      } catch (requireError) {
        console.log('OpenAI package not available - falling back to browser TTS');
        return null;
      }

      if (OpenAI) {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        const mp3 = await openai.audio.speech.create({
          model: "tts-1-hd",
          voice: voice.openai_voice,
          input: text,
          response_format: "mp3",
          speed: 1.0
        });

        const buffer = Buffer.from(await mp3.arrayBuffer());
        return buffer.toString('base64');
      }
    } catch (err) {
      console.error('OpenAI TTS error:', err.message);
      // Continue to try ElevenLabs fallback if available
    }
  }

  // Fallback to ElevenLabs if OpenAI fails or voice is ElevenLabs-specific
  if (voice.provider === 'elevenlabs' && isElevenLabsConfigured()) {
    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voice.elevenlabs_id}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_monolingual_v1',
            voice_settings: { stability: 0.75, similarity_boost: 0.75 }
          })
        }
      );

      if (!response.ok) {
        throw new Error(`ElevenLabs API ${response.status}`);
      }

      const audioBuffer = await response.arrayBuffer();
      return Buffer.from(audioBuffer).toString('base64');
    } catch (err) {
      console.error('ElevenLabs TTS error:', err.message);
    }
  }

  console.log('No voice synthesis available - falling back to browser TTS');
  return null;
}

module.exports = {
  VOICE_OPTIONS,
  getVoiceOption,
  isElevenLabsConfigured,
  isOpenAIConfigured,
  isVoiceConfigured,
  speakResponse
};
