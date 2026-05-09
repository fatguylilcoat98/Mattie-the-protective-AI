/**
 * ENHANCED MEMORY INTEGRATION WITH TAVILY
 * Complete integration of memory services with web search
 */

import { createMemoryServices } from './memory-service-factory';
import { MemoryServices } from './memory-services';

interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

interface TavilyResponse {
  query: string;
  results: TavilySearchResult[];
  answer?: string;
  images?: any[];
  search_depth?: string;
  include_domains?: string[];
  exclude_domains?: string[];
}

export class EnhancedMemorySystem {
  private memoryServices: MemoryServices;
  private tavilyApiKey: string;

  constructor(config: {
    supabaseUrl: string;
    supabaseKey: string;
    pineconeApiKey: string;
    pineconeEnvironment: string;
    pineconeIndexName: string;
    tavilyApiKey: string;
    anthropicApiKey?: string;
  }) {
    this.memoryServices = createMemoryServices({
      supabaseUrl: config.supabaseUrl,
      supabaseKey: config.supabaseKey,
      pineconeApiKey: config.pineconeApiKey,
      pineconeEnvironment: config.pineconeEnvironment,
      pineconeIndexName: config.pineconeIndexName,
      anthropicApiKey: config.anthropicApiKey
    });

    this.tavilyApiKey = config.tavilyApiKey;
  }

  /**
   * Enhanced conversation processing with memory and web search
   */
  async processConversation(
    userId: string,
    userMessage: string,
    sessionId: string,
    workspaceId?: string
  ) {
    // 1. Record user message
    await this.recordUserMessage(userId, userMessage, sessionId);

    // 2. Check if web search is needed
    const needsWebSearch = this.shouldSearchWeb(userMessage);

    // 3. Get existing memory context
    const memoryContext = await this.memoryServices.retrieval.retrieveMemoryContext({
      userId,
      requestText: userMessage,
      requestContext: 'answer_user_question',
      sessionId,
      workspaceId,
      includeReflections: true,
      allowWeaklyGrounded: false // Only grounded memories by default
    });

    // 4. Perform web search if needed
    let webSearchResults: TavilySearchResult[] = [];
    if (needsWebSearch) {
      webSearchResults = await this.performWebSearch(userId, userMessage);
    }

    // 5. Build comprehensive context
    const context = {
      ...memoryContext,
      webSearchResults,
      hasWebSearch: webSearchResults.length > 0
    };

    // 6. Generate response (this would integrate with your existing response generation)
    const response = await this.generateResponse(context, userMessage);

    // 7. Record assistant response and extract memories
    await this.recordAssistantResponse(userId, response, sessionId, workspaceId);

    return {
      response,
      context,
      memoryStats: {
        factsUsed: memoryContext.facts.length,
        interpretationsUsed: memoryContext.interpretations.length,
        bindingRulesActive: memoryContext.governingRules.length,
        webSearchPerformed: needsWebSearch,
        webResultsCount: webSearchResults.length
      }
    };
  }

  /**
   * Web search integration with memory storage
   */
  private async performWebSearch(
    userId: string,
    query: string
  ): Promise<TavilySearchResult[]> {
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
          include_raw_content: false,
          max_results: 5
        })
      });

      if (!response.ok) {
        throw new Error(`Tavily search failed: ${response.statusText}`);
      }

      const data: TavilyResponse = await response.json();

      // Store search results as reference memories
      for (const result of data.results) {
        await this.storeWebSearchResult(userId, query, result);
      }

      return data.results;

    } catch (error) {
      console.error('Web search failed:', error);

      // Log the failure
      await this.memoryServices.write.recordEvent(
        userId,
        'web_search_failed',
        'system',
        `Failed to search web for: ${query}`,
        { error: error.message, query }
      );

      return [];
    }
  }

  /**
   * Store web search results as reference memories
   */
  private async storeWebSearchResult(
    userId: string,
    query: string,
    result: TavilySearchResult
  ) {
    // Create memory item for the search result
    const memoryResult = await this.memoryServices.write.writeMemory({
      type: 'write_user_fact',
      userId,
      content: `${result.title}\n\n${result.content}`,
      category: 'system.external_search',
      memoryType: 'technical_context',
      sourceType: 'web_search',
      confidence: Math.min(result.score, 0.7), // Web results max 0.7 confidence
      importance: 0.3 // Web results are reference only by default
    });

    // Create detailed source record
    if (memoryResult.success && memoryResult.memoryId) {
      // Store the web source details
      await this.memoryServices.write.recordEvent(
        userId,
        'web_search_result_stored',
        'system',
        `Stored web search result from ${result.url}`,
        {
          query,
          url: result.url,
          title: result.title,
          score: result.score,
          published_date: result.published_date,
          memory_id: memoryResult.memoryId
        }
      );
    }

    return memoryResult;
  }

  /**
   * Determine if web search is needed based on user message
   */
  private shouldSearchWeb(message: string): boolean {
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
   * Record user message with proper provenance
   */
  private async recordUserMessage(
    userId: string,
    content: string,
    sessionId: string
  ) {
    // Record in conversations table
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    await supabase
      .from('conversations')
      .insert({
        user_id: userId,
        session_id: sessionId,
        role: 'user',
        content
      });

    // Record event
    await this.memoryServices.write.recordEvent(
      userId,
      'chat_message_received',
      'user',
      content,
      { session_id: sessionId }
    );
  }

  /**
   * Record assistant response and extract memories
   */
  private async recordAssistantResponse(
    userId: string,
    content: string,
    sessionId: string,
    workspaceId?: string
  ) {
    // Record in conversations
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    await supabase
      .from('conversations')
      .insert({
        user_id: userId,
        session_id: sessionId,
        role: 'assistant',
        content
      });

    // Extract any user preferences or facts from the response
    await this.extractMemoriesFromResponse(userId, content, sessionId, workspaceId);

    // Record event
    await this.memoryServices.write.recordEvent(
      userId,
      'assistant_response_generated',
      'splendor',
      content,
      { session_id: sessionId, workspace_id: workspaceId }
    );
  }

  /**
   * Extract memories from assistant response
   */
  private async extractMemoriesFromResponse(
    userId: string,
    response: string,
    sessionId: string,
    workspaceId?: string
  ) {
    // Simple pattern matching for memory extraction
    // In production, you'd use more sophisticated NLP

    const patterns = [
      {
        regex: /I remember (?:that )?you (?:told me |said |mentioned )(.+?)[\.\!\?]/gi,
        type: 'user_fact' as const,
        category: 'chris.personal'
      },
      {
        regex: /You prefer (.+?)[\.\!\?]/gi,
        type: 'user_preference' as const,
        category: 'chris.preferences'
      },
      {
        regex: /Your goal (?:is |was )(.+?)[\.\!\?]/gi,
        type: 'user_goal' as const,
        category: 'chris.goals'
      }
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.regex.exec(response)) !== null) {
        const extractedContent = match[1].trim();

        if (extractedContent.length > 10 && extractedContent.length < 200) {
          await this.memoryServices.write.writeMemory({
            type: 'write_user_fact',
            userId,
            content: extractedContent,
            category: pattern.category,
            memoryType: pattern.type,
            sourceType: 'assistant_response',
            sourceId: sessionId,
            confidence: 0.6, // Medium confidence for extracted memories
            importance: 0.5,
            workspaceId
          });
        }
      }
    }
  }

  /**
   * Generate response using memory context
   * This integrates with your existing response generation
   */
  private async generateResponse(
    context: any,
    userMessage: string
  ): Promise<string> {
    // This is where you'd integrate with Anthropic API
    // For now, return a placeholder that shows memory integration

    const memoryPrompt = this.buildMemoryPrompt(context);

    // TODO: Replace with actual Anthropic API call
    return `Based on my memory and ${context.hasWebSearch ? 'recent web search, ' : ''}here's my response to: "${userMessage}"

[This would be the actual AI response generated with memory context]

Memory used: ${context.facts.length} facts, ${context.interpretations.length} interpretations
${context.hasWebSearch ? `Web search found: ${context.webSearchResults.length} results` : ''}`;
  }

  /**
   * Build memory context prompt for AI
   */
  private buildMemoryPrompt(context: any): string {
    let prompt = '';

    // Add binding decisions first
    if (context.governingRules.length > 0) {
      prompt += 'BINDING DECISIONS - ENFORCE THESE:\n';
      context.governingRules.forEach((rule: any) => {
        prompt += `- ${rule.title}: ${rule.decision}\n`;
      });
      prompt += '\n';
    }

    // Add workspace context
    if (context.workspaceState) {
      prompt += `ACTIVE WORKSPACE: ${context.workspaceState.title}\n`;
      prompt += `Objective: ${context.workspaceState.objective}\n\n`;
    }

    // Add grounded facts
    if (context.facts.length > 0) {
      prompt += 'VERIFIED FACTS:\n';
      context.facts.forEach((fact: any) => {
        prompt += `- ${fact.content} (${fact.citationString})\n`;
      });
      prompt += '\n';
    }

    // Add interpretations (clearly labeled)
    if (context.interpretations.length > 0) {
      prompt += 'MY INTERPRETATIONS (not facts):\n';
      context.interpretations.forEach((interp: any) => {
        prompt += `- ${interp.summary} (${interp.citationString})\n`;
      });
      prompt += '\n';
    }

    // Add web search results if available
    if (context.hasWebSearch) {
      prompt += 'RECENT WEB SEARCH RESULTS:\n';
      context.webSearchResults.forEach((result: any, index: number) => {
        prompt += `${index + 1}. ${result.title}\n   ${result.content.substring(0, 200)}...\n   Source: ${result.url}\n\n`;
      });
    }

    return prompt;
  }

  /**
   * Admin functions for memory management
   */
  async getMemoryStats(userId: string) {
    // This would integrate with your admin dashboard
    return {
      totalMemories: 0, // Get from database
      pendingApproval: 0,
      uncertainMemories: 0,
      webSearchResults: 0,
      activeWorkspaces: 0
    };
  }

  /**
   * Workspace management
   */
  async createWorkspace(
    userId: string,
    title: string,
    objective: string
  ) {
    return await this.memoryServices.workspace.createWorkspace(
      userId,
      title,
      objective
    );
  }

  async updateWorkspace(
    workspaceId: string,
    updates: any
  ) {
    return await this.memoryServices.workspace.updateWorkspace(
      workspaceId,
      updates
    );
  }
}

export default EnhancedMemorySystem;