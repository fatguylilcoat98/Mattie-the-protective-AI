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
const { getMemoriesForUser, storeMemory, logConversation, verifyUser, supabase } = require('../lib/supabase');
const { retrieveMemories, storeMemory: storePineconeMemory, isPineconeConfigured } = require('../lib/pinecone');
const { search: tavilySearch } = require('../lib/tavily');

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

// Get search context using lib/tavily
async function getSearchContext(query) {
  try {
    const results = await tavilySearch(query);
    if (!results) return '';

    let context = '\n\n--- WEB SEARCH RESULTS (Splendor searched the web for this) ---\n';
    if (results.answer) {
      context += `Summary: ${results.answer}\n\n`;
    }
    if (results.results) {
      results.results.forEach((r, i) => {
        context += `Source ${i + 1}: ${r.title}\n${r.content.substring(0, 300)}...\nURL: ${r.url}\n\n`;
      });
    }
    context += '--- END SEARCH RESULTS ---\n';
    context += 'When responding, cite that you searched the web and reference the sources above.\n';
    return context;
  } catch (err) {
    console.error('Tavily search error:', err.message);
    return '';
  }
}


// Save memory from exchange (background task)
async function saveMemoryFromExchange(userId, userMessage, assistantResponse) {
  try {
    console.log(`[MEMORY DEBUG] Analyzing exchange for user ${userId}`);
    console.log(`[MEMORY DEBUG] User message: "${userMessage}"`);

    // SAVE EVERYTHING - no filtering, Chris wants every conversation remembered
    console.log(`[MEMORY DEBUG] Saving complete user message: "${userMessage}"`);

    // Save the complete user message as memory
    const { data: savedMemory, error } = await supabase
      .from('memories')
      .insert({
        user_id: userId,
        content: `User said: "${userMessage}"`,
        memory_type: 'conversation'
      })
      .select()
      .single();

    if (!error && savedMemory) {
      // Also save to Pinecone if available
      if (process.env.PINECONE_API_KEY) {
        try {
          await storePineconeMemory(
            savedMemory.id,
            `User said: "${userMessage}"`,
            userId,
            'conversation'
          );
        } catch (pineconeErr) {
          console.log('Pinecone save skipped:', pineconeErr.message);
        }
      }
      console.log(`[MEMORY DEBUG] FULL conversation saved: "${userMessage}"`);
    } else {
      console.log(`[MEMORY DEBUG] Failed to save to Supabase:`, error);
    }

  } catch (err) {
    console.error('Memory save error:', err.message);
    // Never crash the main conversation on memory errors
  }
}

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
  const { message, userId, authToken } = req.body;

  if (!message || !userId) {
    return res.status(400).json({ error: 'Message and userId required' });
  }

  try {
    // Verify user if token provided
    if (authToken) {
      const user = await verifyUser(authToken);
      if (!user || user.id !== userId) {
        return res.status(401).json({ error: 'Invalid authentication' });
      }
    }

    // STEP 1: Get user's memories for context
    let memories = [];
    let searchResults = null;

    // Try semantic memory retrieval first
    if (isPineconeConfigured()) {
      try {
        const semanticMemories = await retrieveMemories(message, userId, 8);
        if (semanticMemories.length > 0) {
          memories = semanticMemories;
        } else {
          // Fallback to Supabase if no semantic matches
          memories = await getMemoriesForUser(userId, 10);
        }
      } catch (error) {
        console.error('Semantic memory error, falling back to Supabase:', error);
        memories = await getMemoriesForUser(userId, 10);
      }
    } else {
      // Fallback to Supabase when Pinecone not configured
      memories = await getMemoriesForUser(userId, 10);
    }

    // STEP 2: Check if web search is needed
    if (shouldSearch(message)) {
      try {
        searchResults = await getSearchContext(message);
        console.log(`Web search performed for: "${message}"`);
      } catch (error) {
        console.error('Web search error:', error);
        // Continue without search results
      }
    }

    // STEP 3: Generate Splendor's response using original function
    const assistantMessage = await generateSplendorResponse(message, memories, false, searchResults);

    // STEP 5: Save memory async (never block on this)
    saveMemoryFromExchange(userId, message, assistantMessage);

    // STEP 6: Log conversation (background task)
    Promise.all([
      logConversation(userId, 'user', message),
      logConversation(userId, 'assistant', assistantMessage)
    ]).catch(err => console.error('Logging error:', err));

    res.json({
      message: assistantMessage,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;