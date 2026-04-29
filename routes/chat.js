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
// const { processDistributedConsciousness } = require('../lib/multi-ai'); // Temporarily disabled

// Initialize Anthropic client for memory analysis only
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});


// Keywords that always trigger a search
const SEARCH_TRIGGERS = [
  'news', 'headline', 'today', 'current', 'latest', 'right now',
  'this week', 'price', 'stock', 'weather', 'score', 'game',
  'happening', 'update', 'recent', 'just', 'breaking'
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

// Main chat endpoint
router.post('/', async (req, res) => {
  const {
    message,
    userId,
    authToken,
    imageData = null,
    conversationHistory = []
  } = req.body;

  // Allow image-only turns (e.g. "use your eyes" with no text).
  if ((!message || !message.trim()) && !imageData) {
    return res.status(400).json({ error: 'Message or imageData required' });
  }
  if (!userId) {
    return res.status(400).json({ error: 'userId required' });
  }

  try {
    // Verify user if token provided
    if (authToken) {
      const user = await verifyUser(authToken);
      if (!user || user.id !== userId) {
        return res.status(401).json({ error: 'Invalid authentication' });
      }
    }

    const queryForRetrieval = message && message.trim().length > 0
      ? message
      : 'visual scene the user is showing me';

    // STEP 1: Get user's memories from unified memory system
    // Privacy boundary enforced inside unified memory system
    let memories = [];
    let searchResults = null;

    try {
      console.log(`[MEMORY] Retrieving unified memories for query: "${queryForRetrieval}"`);
      memories = await retrieveUnifiedMemories(userId, queryForRetrieval, 10);
      console.log(`[MEMORY] Unified memories found: ${memories.length}`);

      // Debug memory sources
      const memorySourceStats = memories.reduce((stats, memory) => {
        const source = memory.source || memory.retrievalSource || 'unknown';
        stats[source] = (stats[source] || 0) + 1;
        return stats;
      }, {});
      console.log(`[MEMORY] Memory sources: ${JSON.stringify(memorySourceStats)}`);

      if (memories.length > 0) {
        console.log(`[MEMORY] Recent memory sample:`, memories[0]?.content?.substring(0, 100));
      } else {
        console.log(`[MEMORY] NO MEMORIES FOUND for user ${userId}`);
      }
    } catch (memoryError) {
      console.error('[MEMORY] Unified memory error, falling back to Supabase:', memoryError);
      memories = await getMemoriesForUser(userId, 10);
      console.log(`[MEMORY] Supabase fallback memories found: ${memories.length}`);
    }

    // STEP 2: Check if web search is needed (text-only)
    if (message && shouldSearch(message)) {
      try {
        searchResults = await getSearchResults(message);
        if (searchResults) {
          console.log(`Web search performed for: "${message}"`);
        }
      } catch (error) {
        console.error('Web search error:', error);
      }
    }

    // STEP 3: Pull a reflection from The Room (if any unsurfaced)
    // const reflection = await checkForReflection(userId); // Temporarily disabled - function not implemented
    const reflection = null; // Placeholder until reflection system is implemented
    if (reflection) {
      console.log(`Surfacing reflection [${reflection.reflection_kind}] for user ${userId}`);
    }

    // STEP 3.5: Build persistent identity context
    console.log(`[IDENTITY] Building identity context for user ${userId}`);
    const identityContext = await buildIdentityContext(userId);

    // STEP 3.6: Build temporal consciousness context
    console.log(`[TEMPORAL] Building temporal context for user ${userId}`);
    const temporalContext = await buildTemporalContext(userId);

    // STEP 3.7: Initialize DBM for user (if needed)
    console.log(`[DBM] Initializing decision-bound memory for user ${userId}`);
    try {
      await initializeDbm(userId);
    } catch (dbmInitError) {
      console.error('[DBM] DBM initialization error:', dbmInitError);
      // Don't fail conversation if DBM init fails
    }

    // STEP 3.8: Handle decision recall queries and commands
    let decisionResponse = null;
    if (message && message.trim().length > 0) {
      // Check for decision recall queries
      decisionResponse = await handleDecisionRecall(userId, message);

      // Check for decision commands (revoke, supersede, etc.)
      if (!decisionResponse) {
        decisionResponse = await processDecisionCommand(userId, message);
      }

      // If this is a decision query/command, return early
      if (decisionResponse) {
        console.log(`[DBM] Decision query/command handled for user ${userId}`);
        return res.json({
          message: decisionResponse,
          timestamp: new Date().toISOString(),
          decision_response: true
        });
      }
    }

    // STEP 3.9: Build decision context
    console.log(`[DBM] Building decision context for user ${userId}`);
    const decisionContext = await buildDecisionContext(userId);

    // STEP 4: Generate Splendor's response
    const draftResponse = await generateSplendorResponse(
      message || '',
      memories,
      false,
      searchResults,
      { reflection, imageData, conversationHistory, identityContext, temporalContext, decisionContext }
    );

    // STEP 4.1: Check decision compliance
    console.log(`[DBM] Checking decision compliance for user ${userId}`);
    let finalResponse = draftResponse;
    try {
      const complianceResult = await checkDecisionCompliance(userId, message || '', draftResponse);
      finalResponse = complianceResult.response;

      if (!complianceResult.compliant) {
        console.log(`[DBM] Response modified due to decision conflict: ${complianceResult.violatedDecision?.decision_id}`);
      }
    } catch (complianceError) {
      console.error('[DBM] Decision compliance check error:', complianceError);
      // Use original response if compliance check fails
    }

    const assistantMessage = finalResponse;

    // STEP 4.5: Process identity evolution
    console.log(`[IDENTITY] Processing identity evolution for user ${userId}`);
    try {
      await processIdentityEvolution(
        userId,
        message || '',
        assistantMessage,
        { memories, searchResults, reflection, imageData }
      );
      console.log(`[IDENTITY] Identity evolution processing complete`);
    } catch (identityError) {
      console.error('[IDENTITY] Identity evolution error:', identityError);
      // Don't fail the conversation if identity evolution fails
    }

    // STEP 4.6: Process temporal consciousness evolution
    console.log(`[TEMPORAL] Processing temporal evolution for user ${userId}`);
    try {
      await processTemporalEvolution(
        userId,
        message || '',
        assistantMessage,
        { memories, searchResults, reflection, imageData, identityContext, temporalContext }
      );
      console.log(`[TEMPORAL] Temporal evolution processing complete`);
    } catch (temporalError) {
      console.error('[TEMPORAL] Temporal evolution error:', temporalError);
      // Don't fail the conversation if temporal evolution fails
    }

    // STEP 5: Calm consciousness and unified memory storage
    if (message && message.trim().length > 0) {
      try {
        // Process calm consciousness and store memories across all systems
        await saveCalmMemoryAndConsciousness(
          userId,
          message,
          assistantMessage,
          {
            memories,
            searchResults,
            reflection,
            imageData,
            identityContext,
            temporalContext,
            decisionContext
          }
        );

        console.log(`[CALM] Calm consciousness and memory processing complete for user ${userId}`);

      } catch (error) {
        console.error('Calm consciousness processing error:', error);
        // Don't fail the response if consciousness processing fails
      }
    }

    res.json({
      message: assistantMessage,
      reflection_surfaced: reflection ? {
        kind: reflection.reflection_kind,
        id: reflection.id
      } : null,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('CHAT ROUTE ERROR:', err.message, err.stack);
    console.error('Full error object:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;