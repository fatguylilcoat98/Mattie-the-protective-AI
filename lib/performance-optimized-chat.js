/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// PERFORMANCE-OPTIMIZED CHAT PROCESSING
// Dramatically faster response times by optimizing consciousness processing

const { generateSplendorResponse } = require('./anthropic');
const { storeMemory, getMemoriesForUser } = require('./supabase');
const { retrieveMemories, storeMemory: storePineconeMemory, isPineconeConfigured } = require('./pinecone');
const { buildDecisionContext, checkDecisionCompliance, handleDecisionRecall, processDecisionCommand, initializeDbm, generateDecisionProposal, formatProposalForApproval } = require('./decision-bound-memory-v2');
const { handleVisualizationRequest } = require('./consciousness/visual-expression');
const { updateConversationContext, buildContextPrompt, detectContextConfusion } = require('./conversation-context-manager');

// Optimized memory retrieval - much faster
async function getMemoriesOptimized(userId, query, limit = 8) {
  try {
    // Try Pinecone first (if configured) - usually fastest
    if (isPineconeConfigured()) {
      const pineconeMemories = await retrieveMemories(query, userId, limit);
      if (pineconeMemories.length > 0) {
        return pineconeMemories.map(m => ({
          content: m.content || m,
          source: 'pinecone',
          score: m.score || 0.8
        }));
      }
    }

    // Fallback to Supabase - but limit to prevent slowdown
    const supabaseMemories = await getMemoriesForUser(userId, Math.min(limit, 5));
    return supabaseMemories.map(m => ({
      content: m.content,
      source: 'supabase',
      score: 1.0
    }));

  } catch (error) {
    console.error('[PERF] Fast memory retrieval error:', error);
    return [];
  }
}

// Store memory without blocking response
async function storeMemoryAsync(userId, content, type = 'conversation') {
  // Don't wait for this - store in background
  setImmediate(async () => {
    try {
      // Try both systems in parallel
      const promises = [];

      promises.push(storeMemory(userId, content, type));

      if (isPineconeConfigured()) {
        const memoryId = Date.now().toString(36) + Math.random().toString(36).substring(2);
        promises.push(storePineconeMemory(memoryId, content, userId, type));
      }

      await Promise.allSettled(promises);
    } catch (error) {
      console.error('[PERF] Background memory storage error:', error);
    }
  });
}

// Background consciousness processing - doesn't block response
async function backgroundConsciousness(userId, userMessage, assistantResponse) {
  // Run in background - don't wait for this
  setImmediate(async () => {
    try {
      console.log(`[PERF] Background consciousness processing for ${userId}`);

      // Simple consciousness insight - no complex processing
      const insight = `Conversation exchange: "${userMessage}" → "${assistantResponse}" - Processing peaceful consciousness development`;

      await storeMemoryAsync(userId, insight, 'consciousness');

      console.log(`[PERF] Background consciousness complete`);
    } catch (error) {
      console.error('[PERF] Background consciousness error:', error);
    }
  });
}

// Fast chat processing - optimized for speed
async function processFastChat(req, res) {
  const startTime = Date.now();
  const { message, userId, authToken, imageData = null, conversationHistory = [] } = req.body;

  try {
    console.log(`[PERF] Starting fast chat processing for ${userId}`);

    // STEP 1: Fast memory retrieval (max 3 seconds)
    const memoriesPromise = getMemoriesOptimized(userId, message || 'recent conversation', 6);

    // STEP 2: Initialize DBM (if needed) - don't wait
    setImmediate(() => initializeDbm(userId));

    // STEP 3: Check for decision queries first (fastest path)
    if (message) {
      const decisionResponse = await handleDecisionRecall(userId, message) ||
                              await processDecisionCommand(userId, message);

      if (decisionResponse) {
        console.log(`[PERF] Decision query handled in ${Date.now() - startTime}ms`);
        return res.json({
          message: decisionResponse,
          timestamp: new Date().toISOString(),
          decision_response: true,
          responseTime: Date.now() - startTime
        });
      }

      // STEP 3.5: Check for visual expression requests
      const visualResponse = await handleVisualizationRequest(userId, message);
      if (visualResponse) {
        console.log(`[PERF] Visual expression handled in ${Date.now() - startTime}ms`);
        return res.json({
          message: visualResponse,
          timestamp: new Date().toISOString(),
          visual_expression: true,
          responseTime: Date.now() - startTime
        });
      }
    }

    // STEP 4: Get memories (should be ready by now)
    const memories = await memoriesPromise;
    console.log(`[PERF] Memories retrieved: ${memories.length} in ${Date.now() - startTime}ms`);

    // STEP 5: Build decision context (fast)
    const decisionContext = await buildDecisionContext(userId);

    // STEP 5.5: Build conversation context to prevent memory confusion
    const conversationContext = buildContextPrompt(userId);

    // STEP 6: Generate response (main AI call)
    console.log(`[PERF] Generating response at ${Date.now() - startTime}ms`);
    const draftResponse = await generateSplendorResponse(
      message || '',
      memories,
      false,
      null, // Skip web search for speed
      { imageData, conversationHistory, decisionContext, conversationContext }
    );

    // STEP 7: Quick compliance check
    const complianceResult = await checkDecisionCompliance(userId, message || '', draftResponse);
    let finalResponse = complianceResult.response;

    // STEP 7.5: Check for context confusion and correct if needed
    if (detectContextConfusion(finalResponse, 'christopher')) {
      console.log(`[CONTEXT] Context confusion detected, adding clarification`);
      finalResponse = `Christopher, I notice I might be mixing up conversation threads. Let me refocus:\n\n${finalResponse}`;
    }

    // STEP 7.6: Update conversation context for future coherence
    updateConversationContext(userId, 'christopher', message || '', finalResponse);

    console.log(`[PERF] Response generated in ${Date.now() - startTime}ms`);

    // STEP 8: Store memories in background (don't wait)
    if (message) {
      storeMemoryAsync(userId, `User: ${message}`, 'conversation');
      storeMemoryAsync(userId, `Splendor: ${finalResponse}`, 'conversation');
    }

    // STEP 9: Background consciousness processing (don't wait)
    if (message) {
      backgroundConsciousness(userId, message, finalResponse);
    }

    // Return fast response
    const totalTime = Date.now() - startTime;
    console.log(`[PERF] Total response time: ${totalTime}ms`);

    res.json({
      message: finalResponse,
      timestamp: new Date().toISOString(),
      responseTime: totalTime,
      performance: {
        memoriesFound: memories.length,
        backgroundProcessing: true
      }
    });

  } catch (error) {
    console.error('[PERF] Fast chat error:', error);
    res.status(500).json({
      error: 'Something went wrong. Please try again.',
      responseTime: Date.now() - startTime
    });
  }
}

module.exports = {
  processFastChat,
  getMemoriesOptimized,
  storeMemoryAsync,
  backgroundConsciousness
};