/**
 * ENHANCED CHAT ROUTE WITH COMPLETE MEMORY + TAVILY INTEGRATION
 * Replaces existing chat route with full memory system
 */

const express = require('express');
const { EnhancedMemorySystem } = require('../lib/enhanced-memory-integration.js');
const { requireAuth } = require('../middleware/auth.js');
const router = express.Router();

// Initialize enhanced memory system (with error handling)
let memorySystem = null;
try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    memorySystem = new EnhancedMemorySystem({
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseKey: process.env.SUPABASE_SERVICE_KEY,
      pineconeApiKey: process.env.PINECONE_API_KEY,
      pineconeEnvironment: process.env.PINECONE_ENVIRONMENT,
      pineconeIndexName: process.env.PINECONE_INDEX_NAME,
      tavilyApiKey: process.env.TAVILY_API_KEY,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY
    });
    console.log('✅ Enhanced memory system initialized');
  } else {
    console.log('⚠️ Enhanced memory system disabled - missing Supabase credentials');
  }
} catch (error) {
  console.log('❌ Enhanced memory system initialization failed:', error.message);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENHANCED CHAT ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/chat', requireAuth, async (req, res) => {
  try {
    const {
      message,
      sessionId = generateSessionId(),
      workspaceId
    } = req.body;

    const userId = req.userId;

    if (!message) {
      return res.status(400).json({
        error: 'Message is required'
      });
    }

    // Check if enhanced memory system is available
    if (!memorySystem) {
      return res.status(503).json({
        error: 'Enhanced memory system not available',
        message: 'Missing required environment variables (SUPABASE_URL, SUPABASE_SERVICE_KEY)',
        fallback: 'Use /api/chat for basic Splendor functionality'
      });
    }

    // Process conversation with enhanced memory system
    const result = await memorySystem.processConversation(
      userId,
      message,
      sessionId,
      workspaceId
    );

    res.json({
      success: true,
      response: result.response,
      memory_stats: result.memoryStats,
      session_id: sessionId,
      workspace_id: workspaceId,
      context_summary: {
        facts_used: result.context.facts.length,
        interpretations_used: result.context.interpretations.length,
        binding_rules_active: result.context.governingRules.length,
        web_search_performed: result.memoryStats.webSearchPerformed,
        uncertainty_warnings: result.context.facts.filter(f =>
          f.retrievalConfidenceLabel !== 'grounded'
        ).length
      }
    });

  } catch (error) {
    console.error('Enhanced chat error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY MANAGEMENT ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

// Get memory context for debugging
router.get('/memory/context/:userId', requireAuth, async (req, res) => {
  try {
    if (!memorySystem) {
      return res.status(503).json({
        error: 'Enhanced memory system not available'
      });
    }

    const { userId } = req.params;
    const { query = '', workspace_id } = req.query;

    // Ensure users can only access their own memory context
    if (userId !== req.userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only access your own memory context'
      });
    }

    const context = await memorySystem.memoryServices.retrieval.retrieveMemoryContext({
      userId,
      requestText: query,
      workspaceId: workspace_id
    });

    res.json({
      success: true,
      context: {
        facts: context.facts.map(f => ({
          content: f.content,
          category: f.category,
          confidence_label: f.retrievalConfidenceLabel,
          citation: f.citationString,
          uncertainty_reason: f.uncertaintyReason
        })),
        interpretations: context.interpretations,
        governing_rules: context.governingRules,
        workspace_state: context.workspaceState
      }
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get memory context',
      message: error.message
    });
  }
});

// Manual memory creation
router.post('/memory/create', requireAuth, async (req, res) => {
  try {
    const {
      content,
      category,
      memory_type,
      source_type = 'manual_admin',
      confidence = 0.8,
      importance = 0.5
    } = req.body;

    const userId = req.userId;

    const result = await memorySystem.memoryServices.write.writeMemory({
      type: 'write_user_fact',
      userId,
      content,
      category,
      memoryType: memory_type,
      sourceType: source_type,
      confidence,
      importance
    });

    res.json({
      success: result.success,
      memory_id: result.memoryId,
      needs_approval: result.needsApproval,
      errors: result.errors
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to create memory',
      message: error.message
    });
  }
});

// Manual web search
router.post('/search/web', requireAuth, async (req, res) => {
  try {
    const { query } = req.body;
    const userId = req.userId;

    if (!query) {
      return res.status(400).json({
        error: 'Query is required'
      });
    }

    // Use the web search functionality
    const results = await memorySystem.performWebSearch(userId, query);

    res.json({
      success: true,
      query,
      results: results.map(r => ({
        title: r.title,
        url: r.url,
        content: r.content.substring(0, 300) + '...',
        score: r.score
      })),
      stored_as_memories: results.length
    });

  } catch (error) {
    res.status(500).json({
      error: 'Web search failed',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// WORKSPACE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/workspace/create', requireAuth, async (req, res) => {
  try {
    const { title, objective } = req.body;
    const userId = req.userId;

    const workspaceId = await memorySystem.createWorkspace(
      userId,
      title,
      objective
    );

    res.json({
      success: true,
      workspace_id: workspaceId,
      message: 'Workspace created successfully'
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to create workspace',
      message: error.message
    });
  }
});

router.put('/workspace/:workspaceId', async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const updates = req.body;

    await memorySystem.updateWorkspace(workspaceId, updates);

    res.json({
      success: true,
      message: 'Workspace updated successfully'
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to update workspace',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DEBUGGING AND STATS
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/stats/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;

    // Ensure users can only access their own stats
    if (userId !== req.userId) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only access your own stats'
      });
    }

    const stats = await memorySystem.getMemoryStats(userId);

    res.json({
      success: true,
      stats
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

// Test uncertainty flagging
router.get('/test/uncertainty', async (req, res) => {
  try {
    const testMemories = [
      {
        content: 'I prefer coffee',
        provenance: 'USER_STATED',
        confidence: 0.95,
        source_type: 'user_direct_statement',
        created_at: new Date().toISOString()
      },
      {
        content: 'User seems to prefer direct communication',
        provenance: 'INFERRED',
        confidence: 0.6,
        source_type: 'reflection',
        created_at: new Date().toISOString()
      },
      {
        content: 'Old preference from 2020',
        provenance: 'USER_STATED',
        confidence: 0.8,
        source_type: 'imported_memory',
        created_at: '2020-01-01T00:00:00Z'
      }
    ];

    const assessments = testMemories.map(memory => {
      const assessment = memorySystem.memoryServices.uncertainty.assessMemoryUncertainty(
        memory,
        { requestContext: 'test' }
      );

      return {
        content: memory.content,
        assessment
      };
    });

    res.json({
      success: true,
      test_results: assessments
    });

  } catch (error) {
    res.status(500).json({
      error: 'Uncertainty test failed',
      message: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

function generateSessionId() {
  return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

module.exports = router;

/*
 * USAGE EXAMPLES:
 *
 * 1. Basic chat with memory:
 * POST /api/chat
 * { "message": "I prefer dark roast coffee", "userId": "user123" }
 *
 * 2. Chat with web search:
 * POST /api/chat
 * { "message": "What's the latest on AI regulation?", "userId": "user123" }
 *
 * 3. Create workspace:
 * POST /api/workspace/create
 * { "title": "Memory Project", "objective": "Build memory system", "userId": "user123" }
 *
 * 4. Manual web search:
 * POST /api/search/web
 * { "query": "latest AI news", "userId": "user123" }
 *
 * 5. Get memory context:
 * GET /api/memory/context/user123?query=coffee&workspace_id=ws123
 *
 * 6. Test uncertainty:
 * GET /api/test/uncertainty
 */