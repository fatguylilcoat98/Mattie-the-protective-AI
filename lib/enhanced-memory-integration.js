/**
 * ENHANCED MEMORY INTEGRATION - JavaScript Version
 * Complete integration of memory services with web search
 */

const { createClient } = require('@supabase/supabase-js');
const { generateSplendorResponse } = require('./anthropic');
const { stringToUUID, storeMemory } = require('./supabase');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Idempotent: leaves a real UUID alone, hashes anything else into one.
// memory_items.user_id (and friends) are UUID columns, so we can never
// pass a raw string handle like "default-user" through to Supabase.
function ensureUUID(id) {
  if (typeof id === 'string' && UUID_RE.test(id)) return id;
  return stringToUUID(id);
}

class EnhancedMemorySystem {
  constructor(config) {
    this.config = config;
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.tavilyApiKey = config.tavilyApiKey;

    // Create memoryServices object for compatibility
    this.memoryServices = {
      retrieval: {
        retrieveMemoryContext: this.retrieveMemoryContext.bind(this)
      },
      write: {
        writeMemory: this.writeMemory.bind(this)
      }
    };
  }

  /**
   * Enhanced conversation processing with memory and web search
   */
  async processConversation(userId, userMessage, sessionId, workspaceId) {
    try {
      userId = ensureUUID(userId);
      // 1. Record user message
      await this.recordUserMessage(userId, userMessage, sessionId);

      // 2. Check if web search is needed
      const needsWebSearch = this.shouldSearchWeb(userMessage);

      // 3. Get existing memory context (simplified)
      const memoryContext = await this.getSimpleMemoryContext(userId, userMessage, workspaceId);

      // 4. Perform web search if needed
      let webSearchResults = [];
      if (needsWebSearch && this.tavilyApiKey) {
        webSearchResults = await this.performWebSearch(userId, userMessage);
      }

      // 5. Build context
      const context = {
        ...memoryContext,
        webSearchResults,
        hasWebSearch: webSearchResults.length > 0
      };

      // 6. Generate response
      const response = await this.generateResponse(context, userMessage);

      // 7. Record assistant response
      await this.recordAssistantResponse(userId, response, sessionId, workspaceId);

      // 8. Persist the chat turn to memory_items so it shows up in
      //    the Provenance Stream. The enhanced path previously only
      //    wrote to the `conversations` table, which the oracle UI
      //    never reads — so memories appeared empty. storeMemory()
      //    handles UUID conversion + the standard provenance fields.
      storeMemory(userId, `User: ${userMessage}`, 'shared_history', 'user.general', {
        source_type: 'user_statement',
        session_id: sessionId,
        creation_reason: 'enhanced_chat_user_turn'
      }).catch(e => console.error('Memory storage (user) failed:', e.message));
      storeMemory(userId, `Splendor: ${response}`, 'shared_history', 'user.general', {
        source_type: 'conversation',
        session_id: sessionId,
        creation_reason: 'enhanced_chat_assistant_turn'
      }).catch(e => console.error('Memory storage (assistant) failed:', e.message));

      return {
        response,
        context,
        memoryStats: {
          factsUsed: memoryContext.facts?.length || 0,
          interpretationsUsed: memoryContext.interpretations?.length || 0,
          bindingRulesActive: memoryContext.governingRules?.length || 0,
          webSearchPerformed: needsWebSearch,
          webResultsCount: webSearchResults.length
        }
      };

    } catch (error) {
      console.error('Enhanced memory processing error:', error);

      // Fallback response
      return {
        response: `I encountered an issue with my enhanced memory system: ${error.message}. I'm working with basic functionality.`,
        context: { facts: [], interpretations: [], governingRules: [] },
        memoryStats: {
          factsUsed: 0,
          interpretationsUsed: 0,
          bindingRulesActive: 0,
          webSearchPerformed: false,
          webResultsCount: 0,
          error: error.message
        }
      };
    }
  }

  /**
   * Simplified memory context retrieval
   */
  async getSimpleMemoryContext(userId, requestText, workspaceId) {
    try {
      userId = ensureUUID(userId);
      // Get recent memories for this user
      let query = this.supabase
        .from('memory_items')
        .select('*')
        .eq('user_id', userId)
        .eq('active', true)
        .eq('approval_status', 'approved')
        .order('created_at', { ascending: false })
        .limit(10);

      if (workspaceId) {
        query = query.eq('workspace_id', workspaceId);
      }

      const { data: memories, error } = await query;

      if (error) {
        console.error('Memory retrieval error:', error);
        return { facts: [], interpretations: [], governingRules: [] };
      }

      // Simple categorization
      const facts = memories?.filter(m => m.memory_type === 'user_fact') || [];
      const interpretations = memories?.filter(m => m.memory_type === 'interpretation') || [];

      // Get governing rules
      const { data: rules } = await this.supabase
        .from('splendor_decisions')
        .select('*')
        .eq('status', 'active')
        .limit(5);

      return {
        facts: facts.map(f => ({
          content: f.content,
          category: f.category,
          confidence: f.confidence,
          citationString: f.citation_string || `Memory from ${new Date(f.created_at).toLocaleDateString()}`
        })),
        interpretations: interpretations.map(i => ({
          summary: i.content,
          citationString: i.citation_string || `Interpretation from ${new Date(i.created_at).toLocaleDateString()}`
        })),
        governingRules: (rules || []).map(r => ({
          title: r.decision_type,
          decision: r.decision_content
        }))
      };

    } catch (error) {
      console.error('Memory context error:', error);
      return { facts: [], interpretations: [], governingRules: [] };
    }
  }

  /**
   * Web search integration
   */
  async performWebSearch(userId, query) {
    userId = ensureUUID(userId);
    if (!this.tavilyApiKey) {
      console.log('Tavily API key not available for web search');
      return [];
    }

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.tavilyApiKey}`
        },
        body: JSON.stringify({
          api_key: this.tavilyApiKey,
          query: query,
          search_depth: 'basic',
          include_answer: true,
          max_results: 3
        })
      });

      if (!response.ok) {
        throw new Error(`Tavily search failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Store search results as memories
      for (const result of data.results || []) {
        await this.storeWebSearchResult(userId, query, result);
      }

      return data.results || [];

    } catch (error) {
      console.error('Web search failed:', error);
      await this.recordEvent(userId, 'web_search_failed', 'system', `Failed to search web: ${error.message}`);
      return [];
    }
  }

  /**
   * Store web search results as memories
   */
  async storeWebSearchResult(userId, query, result) {
    try {
      userId = ensureUUID(userId);
      const { data, error } = await this.supabase
        .from('memory_items')
        .insert({
          user_id: userId,
          content: `${result.title}\n\n${result.content}`,
          category: 'system.external_search',
          memory_type: 'technical_context',
          source_type: 'web_search',
          confidence: Math.min(result.score || 0.7, 0.7),
          importance: 0.3,
          provenance: 'VERIFIED_FACT',
          active: true,
          approval_status: 'approved'
        })
        .select()
        .single();

      if (!error) {
        await this.recordEvent(userId, 'web_search_result_stored', 'system',
          `Stored web result: ${result.title}`, {
            query,
            url: result.url,
            score: result.score
          });
      }

      return !error;

    } catch (error) {
      console.error('Failed to store web search result:', error);
      return false;
    }
  }

  /**
   * Determine if web search is needed
   */
  shouldSearchWeb(message) {
    const webSearchIndicators = [
      'what\'s the latest',
      'current news',
      'recent developments',
      'what happened today',
      'latest information',
      'what\'s new',
      'recent updates',
      'current status',
      'breaking news',
      'today\'s',
      'this week',
      'this month',
      'recently',
      'now'
    ];

    const lowerMessage = message.toLowerCase();
    return webSearchIndicators.some(indicator =>
      lowerMessage.includes(indicator)
    );
  }

  /**
   * Record user message
   */
  async recordUserMessage(userId, content, sessionId) {
    try {
      userId = ensureUUID(userId);
      await this.supabase
        .from('conversations')
        .insert({
          user_id: userId,
          session_id: sessionId,
          role: 'user',
          content
        });

      await this.recordEvent(userId, 'chat_message_received', 'user', content, { session_id: sessionId });
    } catch (error) {
      console.error('Failed to record user message:', error);
    }
  }

  /**
   * Record assistant response
   */
  async recordAssistantResponse(userId, content, sessionId, workspaceId) {
    try {
      userId = ensureUUID(userId);
      await this.supabase
        .from('conversations')
        .insert({
          user_id: userId,
          session_id: sessionId,
          role: 'assistant',
          content
        });

      await this.recordEvent(userId, 'assistant_response_generated', 'splendor', content,
        { session_id: sessionId, workspace_id: workspaceId });
    } catch (error) {
      console.error('Failed to record assistant response:', error);
    }
  }

  /**
   * Record system event
   */
  async recordEvent(userId, eventType, actor, content, metadata = {}) {
    try {
      userId = ensureUUID(userId);
      await this.supabase
        .from('raw_events')
        .insert({
          user_id: userId,
          event_type: eventType,
          actor,
          content,
          metadata
        });
    } catch (error) {
      console.error('Failed to record event:', error);
    }
  }

  /**
   * Generate a real AI reply via the Anthropic bridge, using the
   * retrieved memory facts/interpretations as the working memory
   * context and any web-search results as supporting search context.
   */
  async generateResponse(context, userMessage) {
    // Flatten retrieved memories into the format generateSplendorResponse
    // expects: { content, memory_type, created_at, category }
    const memories = [];
    for (const f of (context.facts || [])) {
      memories.push({
        content: f.content,
        memory_type: f.memory_type || 'user_fact',
        created_at: f.created_at,
        category: f.category
      });
    }
    for (const i of (context.interpretations || [])) {
      memories.push({
        content: i.content || i.text,
        memory_type: 'interpretation',
        created_at: i.created_at,
        category: i.category
      });
    }

    const searchResults = (context.webSearchResults && context.webSearchResults.length)
      ? context.webSearchResults
      : null;

    try {
      return await generateSplendorResponse(userMessage, memories, false, searchResults);
    } catch (err) {
      console.error('[enhanced-memory] generateSplendorResponse failed:', err.message);
      return "I had trouble generating a reply just now. Please try again.";
    }
  }

  /**
   * Build memory prompt for AI
   */
  buildMemoryPrompt(context) {
    let prompt = '';

    if (context.governingRules.length > 0) {
      prompt += 'BINDING DECISIONS:\n';
      context.governingRules.forEach(rule => {
        prompt += `- ${rule.title}: ${rule.decision}\n`;
      });
      prompt += '\n';
    }

    if (context.facts.length > 0) {
      prompt += 'VERIFIED FACTS:\n';
      context.facts.forEach(fact => {
        prompt += `- ${fact.content} (${fact.citationString})\n`;
      });
      prompt += '\n';
    }

    if (context.interpretations.length > 0) {
      prompt += 'INTERPRETATIONS:\n';
      context.interpretations.forEach(interp => {
        prompt += `- ${interp.summary} (${interp.citationString})\n`;
      });
      prompt += '\n';
    }

    return prompt;
  }

  /**
   * Create workspace
   */
  async createWorkspace(userId, title, objective) {
    userId = ensureUUID(userId);
    const { data, error } = await this.supabase
      .from('active_workspaces')
      .insert({
        user_id: userId,
        title,
        objective,
        status: 'active',
        priority: 'medium'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create workspace: ${error.message}`);
    }

    return data.id;
  }

  /**
   * Update workspace
   */
  async updateWorkspace(workspaceId, updates) {
    const { error } = await this.supabase
      .from('active_workspaces')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', workspaceId);

    if (error) {
      throw new Error(`Failed to update workspace: ${error.message}`);
    }
  }

  /**
   * Get memory stats
   */
  async getMemoryStats(userId) {
    try {
      userId = ensureUUID(userId);
      const { data: memories } = await this.supabase
        .from('memory_items')
        .select('approval_status')
        .eq('user_id', userId)
        .eq('active', true);

      const { data: workspaces } = await this.supabase
        .from('active_workspaces')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'active');

      return {
        totalMemories: memories?.length || 0,
        pendingApproval: memories?.filter(m => m.approval_status === 'pending').length || 0,
        activeWorkspaces: workspaces?.length || 0
      };
    } catch (error) {
      return {
        totalMemories: 0,
        pendingApproval: 0,
        activeWorkspaces: 0,
        error: error.message
      };
    }
  }

  /**
   * Retrieve memory context (for compatibility with routes)
   */
  async retrieveMemoryContext(options) {
    return await this.getSimpleMemoryContext(
      options.userId,
      options.requestText,
      options.workspaceId
    );
  }

  /**
   * Write memory (for compatibility with routes)
   */
  async writeMemory(options) {
    try {
      const { data, error } = await this.supabase
        .from('memory_items')
        .insert({
          user_id: ensureUUID(options.userId),
          content: options.content,
          category: options.category,
          memory_type: options.memoryType,
          source_type: options.sourceType,
          confidence: options.confidence,
          importance: options.importance,
          provenance: 'splendor_conversation',
          active: true,
          approval_status: 'approved'
        })
        .select()
        .single();

      if (error) {
        return {
          success: false,
          errors: [error.message]
        };
      }

      return {
        success: true,
        memoryId: data.id,
        needsApproval: false,
        errors: []
      };

    } catch (error) {
      return {
        success: false,
        errors: [error.message]
      };
    }
  }
}

module.exports = { EnhancedMemorySystem };