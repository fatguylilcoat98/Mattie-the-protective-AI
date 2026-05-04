/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const express = require('express');
const router = express.Router();
const { generateSplendorResponse } = require('../lib/anthropic');
const { getMemoriesForUser, storeMemory } = require('../lib/supabase');

// Simple chat endpoint - just the essentials
router.post('/', async (req, res) => {
  try {
    const { message, userId = 'default' } = req.body;
    
    console.log(`[CHAT] Processing message from ${userId}: ${message}`);

    // Get basic memories
    let memories = [];
    try {
      memories = await getMemoriesForUser(userId, 5);
    } catch (memError) {
      console.error('Memory retrieval failed:', memError);
    }

    // Generate response
    const response = await generateSplendorResponse(message, memories, false);

    console.log(`[CHAT] Response generated successfully`);

    // Send response immediately — don't make the user wait for memory writes.
    res.json({
      message: response,
      timestamp: new Date().toISOString()
    });

    // Fire-and-forget memory writes after the response has been sent.
    // Errors are logged but never delay the user-visible reply.
    storeMemory(userId, `User: ${message}`, 'conversation')
      .catch((e) => console.error('Memory storage (user) failed:', e.message));
    storeMemory(userId, `Splendor: ${response}`, 'conversation')
      .catch((e) => console.error('Memory storage (assistant) failed:', e.message));

  } catch (error) {
    console.error('[CHAT] Error:', error);
    res.status(500).json({
      error: error.message || 'Unable to process your message'
    });
  }
});

// Simple streaming endpoint
router.post('/stream', async (req, res) => {
  const { message, userId = 'default' } = req.body;

  try {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // Get memories
    let memories = [];
    try {
      memories = await getMemoriesForUser(userId, 5);
    } catch (memError) {
      console.error('Memory error:', memError);
    }

    // Generate response
    const response = await generateSplendorResponse(message || '', memories, false);

    // Send as simulated streaming (word by word)
    const words = response.split(' ');
    for (let i = 0; i < words.length; i++) {
      const token = words[i] + (i < words.length - 1 ? ' ' : '');
      res.write(`data: ${JSON.stringify({ type: 'token', text: token })}\n\n`);
      await new Promise(resolve => setTimeout(resolve, 50)); // Small delay
    }

    // Send completion
    res.write(`data: ${JSON.stringify({ 
      type: 'done', 
      conversation_id: require('crypto').randomUUID(), 
      full_response: response 
    })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();

  } catch (error) {
    console.error('[STREAM] Error:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  }
});

module.exports = router;
