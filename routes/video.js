/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Truth · Safety · We Got Your Back
 */

const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODELSLAB_API_KEY = process.env.MODELSLAB_API_KEY;

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
    const response = await fetch('https://modelslab.com/api/v7/video-fusion/text-to-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: MODELSLAB_API_KEY,
        model_id: 'kling-v2-master-t2v',
        prompt: prompt.substring(0, 1000),
        duration: '5'
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
    console.log(`[Splendor Video] Prompt: ${videoPrompt.substring(0, 100)}...`);
    
    const videoResponse = await generateVideo(videoPrompt);
    console.log(`[Splendor Video] Response:`, videoResponse);

    return res.json({
      prompt: videoPrompt,
      videoResponse: videoResponse,
      status: videoResponse.status || 'processing'
    });

  } catch (error) {
    console.error('[Splendor Video] Route error:', error);
    res.status(500).json({ error: 'Generation failed', details: error.message });
  }
});

module.exports = router;
