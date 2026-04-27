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


// Check for an unsurfaced reflection from The Room.
// Returns the reflection (and marks it surfaced) or null.
async function checkForReflection(userId) {
  try {
    const uuid = stringToUUID(userId);
    const { data, error } = await supabase
      .from('reflections')
      .select('id, content, reflection_kind, created_at')
      .eq('user_id', uuid)
      .eq('surfaced', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    await supabase
      .from('reflections')
      .update({ surfaced: true })
      .eq('id', data.id);

    return data;
  } catch (err) {
    console.error('Reflection check error:', err.message);
    return null;
  }
}

// Save memory from exchange (background task)
async function saveMemoryFromExchange(userId, userMessage, assistantResponse) {
  try {
    console.log(`[MEMORY DEBUG] Analyzing exchange for user ${userId}`);
    console.log(`[MEMORY DEBUG] User message: "${userMessage}"`);

    // SAVE EVERYTHING - no filtering, Chris wants every conversation remembered
    console.log(`[MEMORY DEBUG] Saving complete user message: "${userMessage}"`);

    // Save the complete user message as memory using proper storeMemory function
    const savedMemory = await storeMemory(userId, `User said: "${userMessage}"`, 'general');

    if (savedMemory) {
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
      console.log(`[MEMORY DEBUG] Failed to save to Supabase - storeMemory returned null`);
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

    // STEP 1: Get user's memories for context
    // Privacy boundary enforced inside getMemoriesForUser / retrieveMemories.
    let memories = [];
    let searchResults = null;

    if (isPineconeConfigured()) {
      try {
        const semanticMemories = await retrieveMemories(queryForRetrieval, userId, 8);
        if (semanticMemories.length > 0) {
          memories = semanticMemories;
        } else {
          memories = await getMemoriesForUser(userId, 10);
        }
      } catch (error) {
        console.error('Semantic memory error, falling back to Supabase:', error);
        memories = await getMemoriesForUser(userId, 10);
      }
    } else {
      memories = await getMemoriesForUser(userId, 10);
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
    const reflection = await checkForReflection(userId);
    if (reflection) {
      console.log(`Surfacing reflection [${reflection.reflection_kind}] for user ${userId}`);
    }

    // STEP 4: Generate Splendor's response
    const assistantMessage = await generateSplendorResponse(
      message || '',
      memories,
      false,
      searchResults,
      { reflection, imageData, conversationHistory }
    );

    // STEP 5: Save memory async (never block on this).
    // Skip memory save for image-only turns to avoid storing empty user lines.
    if (message && message.trim().length > 0) {
      saveMemoryFromExchange(userId, message, assistantMessage);
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
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;