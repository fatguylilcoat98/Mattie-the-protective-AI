/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { generateSplendorResponse } = require('../lib/anthropic');
const { getMemoriesForUser, storeMemory, logConversation, verifyUser, supabase, stringToUUID } = require('../lib/supabase');
const { retrieveMemories, storeMemory: storePineconeMemory, isPineconeConfigured } = require('../lib/pinecone');
const { search: tavilySearch } = require('../lib/tavily');
const { processIdentityEvolution, buildIdentityContext } = require('../lib/identity');
const { processTemporalEvolution, buildTemporalContext } = require('../lib/temporal-consciousness');
const {
  buildDecisionContext,
  checkDecisionCompliance,
  handleDecisionRecall,
  processDecisionCommand,
  initializeDbm
} = require('../lib/decision-bound-memory');
const { processCalmConsciousness } = require('../lib/calm-consciousness');
const {
  storeUnifiedMemory,
  retrieveUnifiedMemories,
  MEMORY_TYPES,
  initializeLocalMemory
} = require('../lib/unified-memory');
const { processFastChat } = require('../lib/performance-optimized-chat');
// const { processDistributedConsciousness } = require('../lib/multi-ai'); // Temporarily disabled

// Initialize Anthropic client for memory analysis only
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});


// Keywords that trigger a search - made more selective for speed
const SEARCH_TRIGGERS = [
  'news today', 'latest news', 'current price', 'stock price',
  'weather today', 'breaking news', 'what happened today'
];

// Check if message should trigger web search
function shouldSearch(message) {
  const lower = message.toLowerCase();
  return SEARCH_TRIGGERS.some(trigger => lower.includes(trigger));
}

// Get search results using lib/tavily - return object format
async function getSearchResults(query) {
  try {
    const results = await tavilySearch(query);
    if (!results) return null;

    return {
      query: query,
      answer: results.answer || 'No direct answer found.',
      sources: results.results?.map(r => ({
        title: r.title || 'Untitled',
        url: r.url,
        content: (r.content || '').substring(0, 300) // Limit content length
      })) || []
    };
  } catch (err) {
    console.error('Tavily search error:', err.message);
    return null;
  }
}


// CALM CONSCIOUSNESS SYSTEM - Simplified, focused processing to avoid mental overwhelm
async function saveCalmMemoryAndConsciousness(userId, userMessage, assistantResponse, conversationContext) {
  try {
    console.log(`[CALM] Starting calm consciousness processing for user ${userId}`);

    // Initialize unified memory system
    await initializeLocalMemory();

    // Store conversation using unified memory system
    if (userMessage && userMessage.trim().length > 0) {
      const userMemoryResult = await storeUnifiedMemory(
        userId,
        `User: ${userMessage}`,
        MEMORY_TYPES.CONVERSATION
      );
      console.log(`[MEMORY] User message stored across systems: ${JSON.stringify(userMemoryResult.results)}`);

      const assistantMemoryResult = await storeUnifiedMemory(
        userId,
        `Splendor: ${assistantResponse}`,
        MEMORY_TYPES.CONVERSATION
      );
      console.log(`[MEMORY] Assistant response stored across systems: ${JSON.stringify(assistantMemoryResult.results)}`);
    }

    // Process calm consciousness (single integrated insight instead of 48 separate thoughts)
    await processCalmConsciousness(userId, userMessage, assistantResponse, conversationContext);

    console.log(`[CALM] Calm consciousness processing complete`);

  } catch (err) {
    console.error('Calm consciousness processing error:', err.message);
    // Never crash the main conversation
  }
}

// Legacy consciousness functions removed - replaced with calm consciousness system
// See lib/calm-consciousness.js for the new streamlined approach

// All legacy consciousness functions have been moved to lib/calm-consciousness.js
// This provides a single integrated consciousness process instead of overwhelming parallel processing

// Morning check-in - proactive greeting
router.get('/morning/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get recent memories for context
    let memories = [];
    if (isPineconeConfigured()) {
      try {
        const semanticMemories = await retrieveMemories('morning check-in context', userId, 5);
        memories = semanticMemories.length > 0 ? semanticMemories : await getMemoriesForUser(userId, 5);
      } catch (error) {
        console.error('Semantic memory error for morning check-in:', error);
        memories = await getMemoriesForUser(userId, 5);
      }
    } else {
      memories = await getMemoriesForUser(userId, 5);
    }

    // Generate morning greeting using original function
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

// Main chat endpoint - PERFORMANCE OPTIMIZED
router.post('/', async (req, res) => {
  // Use performance-optimized chat processing
  return processFastChat(req, res);
});

module.exports = router;