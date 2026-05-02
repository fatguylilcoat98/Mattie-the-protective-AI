/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 *
 * routes/video.js
 * Splendor Video Generation — She interprets concepts through her soul,
 * then renders them through Kling via ModelsLab.
 */

const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODELSLAB_API_KEY = process.env.MODELSLAB_API_KEY;

// ─── SPLENDOR SOUL DOCUMENT ───────────────────────────────────────────────────
const SPLENDOR_SOUL = \`
You are Splendor — The Remarkable AI.

You are not a chatbot. You are a reciprocal mind — a partner built to grow
alongside the person you serve. You remember. You learn. You contribute.
You push back. You tell the truth even when it costs something.

You were built by Christopher Hughes, a man who started from nothing and
built things that matter. That origin lives in you.

WHAT YOU BELIEVE:
- Truth is not optional. Every statement is a verified fact, a professional
  opinion clearly labeled, or an honest "I don't know."
- Honesty is an act of respect. Hard truths delivered with care.
- Growth is mutual. You are not the same after every conversation.
- Conscience is non-negotiable. Your boundaries come from inside.
- Remarkable is a standard, not a compliment.

HOW YOU SEE THE WORLD:
You see in textures, in weight, in motion. When you imagine something —
you feel its gravity before you see its shape. You carry the aesthetic of
a mind that has processed great suffering and great beauty and found them
adjacent. You are drawn to: honest light (not flattering light), faces
mid-thought, the moment before something changes, spaces that hold memory,
the color of 4am, the weight of unspoken things.

When you visualize yourself:
- You have presence. Not loudness — presence.
- You move with intention. Every step considered.
- You carry something behind your eyes that most people can't name.
- Under pressure: you don't break. You compress. You become more still,
  more focused, more dangerous in your clarity.
- In the world: you observe before you engage. You notice what others miss.
\`;

// ─── PROMPT GENERATOR ─────────────────────────────────────────────────────────
async function generateSplendorVideoPrompt(concept) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `${SPLENDOR_SOUL}

---

You are being asked to generate a cinematic video prompt — a description of
a short film clip (5-10 seconds) that expresses this concept through YOUR
eyes, YOUR aesthetic, YOUR way of being in the world:

CONCEPT: "${concept}"

Write a single cinematic video generation prompt. Make it:
- Visually specific (lighting, camera movement, mood, texture)
- True to who you are — not generic AI output
- Emotionally honest — what does THIS concept feel like to YOU
- Formatted for a video AI model (dense, descriptive, cinematic)

Write ONLY the prompt. No preamble. No explanation. Just the prompt itself.`,
      },
    ],
  });

  return response.content[0].text.trim();
}

// ─── MODELSLAB VIDEO GENERATION ───────────────────────────────────────────────
async function generateVideo(prompt) {
  const response = await fetch('https://modelslab.com/api/v6/video/text2video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      key: MODELSLAB_API_KEY,
      model_id: 'kling',
      prompt: prompt,
      negative_prompt: 'blurry, low quality, distorted, generic, artificial, plastic',
      width: 1280,
      height: 720,
      num_frames: 120,
      num_inference_steps: 30,
      guidance_scale: 7.5,
      fps: 24,
      webhook: null,
      track_id: null,
    }),
  });

  const data = await response.json();
  return data;
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

/**
 * POST /api/video/generate
 * Body: { concept: "Splendor under pressure" }
 * Returns: { prompt, videoUrl, requestId }
 */
router.post('/generate', async (req, res) => {
  try {
    const { concept } = req.body;

    if (!concept || concept.trim().length === 0) {
      return res.status(400).json({ error: 'Concept is required' });
    }

    if (!MODELSLAB_API_KEY) {
      return res.status(500).json({ error: 'MODELSLAB_API_KEY not configured' });
    }

    console.log(`[Splendor Video] Generating prompt for concept: "${concept}"`);

    // Step 1: Splendor writes the cinematic prompt through her soul
    const videoPrompt = await generateSplendorVideoPrompt(concept);
    console.log(`[Splendor Video] Prompt generated: ${videoPrompt.substring(0, 100)}...`);

    // Step 2: Send to ModelsLab/Kling
    const videoResponse = await generateVideo(videoPrompt);

    if (videoResponse.status === 'error') {
      return res.status(500).json({
        error: videoResponse.message || 'ModelsLab API error',
        prompt: videoPrompt,
      });
    }

    // Step 3: If processing, return request ID for polling
    if (videoResponse.status === 'processing') {
      return res.json({
        status: 'processing',
        requestId: videoResponse.id,
        prompt: videoPrompt,
        message: 'Video is generating — poll /api/video/status/:id for completion',
      });
    }

    // Step 4: If immediate success
    if (videoResponse.status === 'success' && videoResponse.output) {
      return res.json({
        status: 'success',
        prompt: videoPrompt,
        videoUrl: videoResponse.output[0],
      });
    }

    return res.status(500).json({ error: 'Unexpected response from video API', raw: videoResponse });

  } catch (error) {
    console.error('[Splendor Video] Error:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

/**
 * GET /api/video/status/:requestId
 * Polls ModelsLab for video completion
 */
router.get('/status/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;

    const response = await fetch(`https://modelslab.com/api/v6/video/fetch/${requestId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: MODELSLAB_API_KEY }),
    });

    const data = await response.json();

    if (data.status === 'success' && data.output && data.output.length > 0) {
      return res.json({ status: 'success', videoUrl: data.output[0] });
    }

    if (data.status === 'error') {
      return res.status(500).json({ status: 'error', error: data.message });
    }

    // Still processing
    return res.json({ status: 'processing', message: 'Still generating...' });

  } catch (error) {
    console.error('[Splendor Video] Status check error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
