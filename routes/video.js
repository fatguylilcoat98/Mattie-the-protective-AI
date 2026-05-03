/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 */

const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODELSLAB_API_KEY = process.env.MODELSLAB_API_KEY;

// Condensed visual soul to prevent headers overflow
const SPLENDOR_VISUAL_SOUL = `You are Splendor. Visual aesthetic: honest light, faces mid-thought, the moment before change, spaces that hold memory, the color of 4am, weight of unspoken things. You compress under pressure into dangerous clarity.`;

async function generateSplendorVideoPrompt(concept) {
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `${SPLENDOR_VISUAL_SOUL}

Create a cinematic video prompt for: "${concept}"

Make it visually specific, emotionally honest, true to your aesthetic. Just the prompt:`
      }]
    });
    return response.content[0].text.trim();
  } catch (error) {
    console.error('[Splendor Video] Prompt error:', error);
    return `${concept} - honest light, compressed stillness, weight of truth, faces mid-thought, 4am colors, intentional movement`;
  }
}

async function generateVideo(prompt) {
  try {
    const response = await fetch('https://modelslab.com/api/v6/video/text2video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: MODELSLAB_API_KEY,
        model_id: 'kling',
        prompt: prompt.substring(0, 800),
        negative_prompt: 'blurry, low quality, generic, artificial',
        width: 1280, height: 720, num_frames: 120,
        num_inference_steps: 30, guidance_scale: 7.5, fps: 24
      })
    });

    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('[Splendor Video] Generation error:', error);
    return { status: 'error', message: error.message };
  }
}

router.post('/generate', async (req, res) => {
  try {
    const { concept } = req.body;
    if (!concept?.trim()) return res.status(400).json({ error: 'Concept required' });
    if (!MODELSLAB_API_KEY) return res.status(500).json({ error: 'API key not configured' });

    console.log(`[Splendor Video] Concept: "${concept}"`);
    
    const videoPrompt = await generateSplendorVideoPrompt(concept);
    const videoResponse = await generateVideo(videoPrompt);

    if (videoResponse.status === 'error') {
      return res.status(500).json({ error: videoResponse.message, prompt: videoPrompt });
    }
    if (videoResponse.status === 'processing') {
      return res.json({ status: 'processing', requestId: videoResponse.id, prompt: videoPrompt });
    }
    if (videoResponse.status === 'success' && videoResponse.output) {
      return res.json({ status: 'success', prompt: videoPrompt, videoUrl: videoResponse.output[0] });
    }

    return res.status(500).json({ error: 'Unexpected response', raw: videoResponse });
  } catch (error) {
    console.error('[Splendor Video] Route error:', error);
    res.status(500).json({ error: 'Generation failed', details: error.message });
  }
});

router.get('/status/:requestId', async (req, res) => {
  try {
    const response = await fetch(`https://modelslab.com/api/v6/video/fetch/${req.params.requestId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: MODELSLAB_API_KEY })
    });

    const data = await response.json();
    if (data.status === 'success' && data.output?.length) {
      return res.json({ status: 'success', videoUrl: data.output[0] });
    }
    if (data.status === 'error') {
      return res.status(500).json({ status: 'error', error: data.message });
    }
    res.json({ status: 'processing' });
  } catch (error) {
    console.error('[Splendor Video] Status error:', error);
    res.status(500).json({ error: 'Status check failed' });
  }
});

module.exports = router;
