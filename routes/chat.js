/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const express = require('express');
const router = express.Router();
const { generateSplendorResponse, extractMemory } = require('../lib/anthropic');
const { getMemoriesForUser, storeMemory, logConversation, verifyUser } = require('../lib/supabase');

// Morning check-in - proactive greeting
router.get('/morning/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get recent memories for context
    const memories = await getMemoriesForUser(userId, 5);

    // Generate morning question
    const greeting = await generateSplendorResponse('', memories, true);

    res.json({
      message: greeting,
      type: 'morning-checkin'
    });
  } catch (error) {
    console.error('Morning check-in error:', error);
    res.status(500).json({ error: 'Unable to start morning check-in' });
  }
});

// Main chat endpoint
router.post('/', async (req, res) => {
  try {
    const { message, userId, authToken } = req.body;

    if (!message || !userId) {
      return res.status(400).json({ error: 'Message and userId required' });
    }

    // Verify user if token provided
    if (authToken) {
      const user = await verifyUser(authToken);
      if (!user || user.id !== userId) {
        return res.status(401).json({ error: 'Invalid authentication' });
      }
    }

    // Get user's memories for context
    const memories = await getMemoriesForUser(userId, 10);

    // Generate Splendor's response
    const splendorResponse = await generateSplendorResponse(message, memories);

    // Log the conversation (background task)
    Promise.all([
      logConversation(userId, 'user', message),
      logConversation(userId, 'assistant', splendorResponse)
    ]).catch(err => console.error('Logging error:', err));

    // Extract and store memory (background task)
    extractMemory(message, splendorResponse)
      .then(memory => {
        if (memory) {
          // Determine memory type based on content
          let memoryType = 'general';
          const lowerMemory = memory.toLowerCase();

          if (lowerMemory.includes('commit') || lowerMemory.includes('will ') || lowerMemory.includes('going to')) {
            memoryType = 'commitment';
          } else if (lowerMemory.includes('correct') || lowerMemory.includes('wrong') || lowerMemory.includes('actually')) {
            memoryType = 'correction';
          } else if (lowerMemory.includes('insight') || lowerMemory.includes('realize') || lowerMemory.includes('understand')) {
            memoryType = 'insight';
          }

          return storeMemory(userId, memory, memoryType);
        }
      })
      .catch(err => console.error('Memory storage error:', err));

    res.json({
      message: splendorResponse,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message || 'Something went wrong — try again' });
  }
});

module.exports = router;