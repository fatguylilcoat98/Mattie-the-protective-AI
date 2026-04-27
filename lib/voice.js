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
  {
    id: 'calm_direct',
    name: 'Calm & Direct',
    description: 'Clear, grounded, no-nonsense. Warm but not soft.',
    elevenlabs_id: 'EXAVITQu4vr4xnSDxMaL' // Rachel
  },
  {
    id: 'warm_steady',
    name: 'Warm & Steady',
    description: 'Present and caring. Like someone who has time for you.',
    elevenlabs_id: 'pNInz6obpgDQGcFmaJgB' // Adam
  },
  {
    id: 'clear_strong',
    name: 'Clear & Strong',
    description: 'Direct and confident. Truth delivered with conviction.',
    elevenlabs_id: 'jBpfuIE2acCO8z3wKNLl' // Matilda
  }
];

function getVoiceOption(voiceKey) {
  return VOICE_OPTIONS.find(v => v.id === voiceKey) || VOICE_OPTIONS[0];
}

function isElevenLabsConfigured() {
  return !!process.env.ELEVENLABS_API_KEY;
}

// Synthesize speech via ElevenLabs. Returns a base64-encoded MP3 string,
// or null if synthesis is unavailable / fails (caller falls back to browser TTS).
async function speakResponse(text, voiceKey = 'calm_direct') {
  if (!isElevenLabsConfigured()) {
    return null;
  }

  const voice = getVoiceOption(voiceKey);

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
    console.error('Voice error:', err.message);
    return null;
  }
}

module.exports = {
  VOICE_OPTIONS,
  getVoiceOption,
  isElevenLabsConfigured,
  speakResponse
};
