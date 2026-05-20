/**
 * MEMORY RETRIEVAL SERVICE
 * Single exit point for all memory reads
 * Implements uncertainty flagging and contextual resonance logic
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  MemoryRetrievalService,
  MemoryQuery,
  RetrievalContext,
  RetrievedMemory,
  RetrievedReflection,
  RetrievedDecision,
  WorkspaceContext,
  RequestContext,
  RetrievalConfidenceLabel
} from './memory-services';

export class MemoryRetrievalServiceImpl implements MemoryRetrievalService {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async retrieveMemoryContext(query: MemoryQuery): Promise<RetrievalContext> {
    // Step 1: Get working context (session and workspace)
    const workspaceState = query.workspaceId ?
      await this.getWorkspaceContext(query.workspaceId) : undefined;

    const recentMessages = query.sessionId ?
      await this.getRecentMessages(query.sessionId, 10) : [];

    // Step 2: Get governing rules (always included)
    const governingRules = await this.getActiveDecisions(query.userId);

    // Step 3: Search and retrieve memories with uncertainty assessment
    const facts = await this.searchMemories(query.userId, query.requestText, {
      categories: query.categories,
      memoryTypes: query.memoryTypes,
      minConfidence: query.minConfidence,
      workspaceId: query.workspaceId
    });

    // Step 4: Get relevant reflections if requested
    const interpretations = query.includeReflections ?
      await this.getRelevantReflections(query.userId, query.requestText, query.workspaceId) : [];

    // Step 5: Apply multi-factor ranking
    const rankedFacts = this.rankMemories(facts, query);

    // Step 6: Log access for all used memories
    for (const memory of rankedFacts) {
      await this.logMemoryAccess(
        query.userId,
        memory.memoryId,
        query.requestContext,
        `Retrieved for: ${query.requestText.substring(0, 100)}`,
        query.sessionId,
        query.workspaceId
      );
    }

    return {
      governingRules,
      workspaceState,
      facts: rankedFacts.slice(0, query.maxResults || 10),
      interpretations,
      recentMessages
    };
  }

  async searchMemories(
    userId: string,
    queryText: string,
    filters?: {
      categories?: string[];
      memoryTypes?: any[];
      minConfidence?: number;
      workspaceId?: string;
    }
  ): Promise<RetrievedMemory[]> {
    let query = this.supabase
      .from('memories')
      .select('*')
      .eq('user_id', userId);

    // Apply filters
    if (filters?.categories?.length) {
      query = query.in('category', filters.categories);
    }

    if (filters?.memoryTypes?.length) {
      query = query.in('memory_type', filters.memoryTypes);
    }

    if (filters?.minConfidence) {
      query = query.gte('confidence', filters.minConfidence);
    }

    if (filters?.workspaceId) {
      query = query.eq('workspace_id', filters.workspaceId);
    }

    const { data: memories, error } = await query;

    if (error) {
      throw new Error(`Failed to search memories: ${error.message}`);
    }

    return memories.map(memory => this.mapToRetrievedMemory(memory, queryText));
  }

  async getActiveDecisions(userId: string): Promise<RetrievedDecision[]> {
    const { data: decisions, error } = await this.supabase
      .from('active_binding_decisions')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to get active decisions: ${error.message}`);
    }

    return decisions.map(decision => ({
      decisionId: decision.id,
      title: decision.title,
      decision: decision.decision,
      context: decision.context,
      reason: decision.reason,
      priority: decision.priority,
      binding: decision.binding,
      citationString: `Binding decision "${decision.title}" established ${this.formatDate(decision.created_at)}.`,
      createdAt: new Date(decision.created_at)
    }));
  }

  async logMemoryAccess(
    userId: string,
    memoryId: string,
    requestContext: RequestContext,
    reasonUsed: string,
    conversationId?: string,
    workspaceId?: string
  ): Promise<void> {
    // Get uncertainty assessment for logging
    const { data: memory } = await this.supabase
      .from('memories')
      .select('*')
      .eq('id', memoryId)
      .single();

    const uncertaintyAssessment = memory?.uncertainty_assessment;

    await this.supabase
      .from('memory_access_log')
      .insert({
        user_id: userId,
        memory_item_id: memoryId,
        conversation_id: conversationId,
        workspace_id: workspaceId,
        request_context: requestContext,
        reason_used: reasonUsed,
        retrieval_confidence_label: uncertaintyAssessment?.confidence_label || 'grounded',
        uncertainty_reason: uncertaintyAssessment?.uncertainty_reason,
        uncertainty_flagged: uncertaintyAssessment?.should_flag || false
      });

    // Update memory access stats
    await this.supabase
      .from('memories')
      .update({
        last_accessed_at: new Date().toISOString(),
        access_count: this.supabase.sql`access_count + 1`
      })
      .eq('id', memoryId);
  }

  assessRetrievalConfidence(
    memory: any,
    queryContext: MemoryQuery
  ): {
    label: RetrievalConfidenceLabel;
    reason?: string;
    citationString: string;
  } {
    const uncertaintyAssessment = memory.uncertainty_assessment || {};

    return {
      label: uncertaintyAssessment.confidence_label || 'grounded',
      reason: uncertaintyAssessment.uncertainty_reason,
      citationString: memory.citation_string || `Memory from ${this.formatDate(memory.created_at)}.`
    };
  }

  async getWorkspaceContext(workspaceId: string): Promise<WorkspaceContext> {
    const { data: workspace, error } = await this.supabase
      .from('active_workspaces')
      .select('*')
      .eq('id', workspaceId)
      .single();

    if (error) {
      throw new Error(`Failed to get workspace context: ${error.message}`);
    }

    return {
      workspaceId: workspace.id,
      title: workspace.title,
      objective: workspace.objective,
      currentState: workspace.current_state,
      openQuestions: workspace.open_questions || [],
      nextSteps: workspace.next_steps || [],
      lastWorkedAt: new Date(workspace.last_worked_at)
    };
  }

  private async getRecentMessages(sessionId: string, limit: number = 10) {
    const { data: messages, error } = await this.supabase
      .from('conversations')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get recent messages: ${error.message}`);
    }

    return messages.reverse(); // Return in chronological order
  }

  private async getRelevantReflections(
    userId: string,
    queryText: string,
    workspaceId?: string
  ): Promise<RetrievedReflection[]> {
    let query = this.supabase
      .from('reflections')
      .select('*')
      .eq('user_id', userId)
      .in('approval_status', ['approved', 'surfaced'])
      .order('created_at', { ascending: false })
      .limit(5);

    // TODO: Add semantic similarity search for reflections
    // For now, just get recent relevant reflections

    const { data: reflections, error } = await query;

    if (error) {
      throw new Error(`Failed to get reflections: ${error.message}`);
    }

    return reflections.map(reflection => ({
      reflectionId: reflection.id,
      reflectionType: reflection.reflection_type,
      summary: reflection.summary,
      whatINoticed: reflection.what_i_noticed,
      whyItMatters: reflection.why_it_matters,
      confidence: reflection.confidence,
      isInterpretation: true,
      citationString: `My interpretation from ${this.formatDate(reflection.created_at)}: "${reflection.summary}"`,
      createdAt: new Date(reflection.created_at)
    }));
  }

  private mapToRetrievedMemory(memory: any, queryText: string): RetrievedMemory {
    const uncertaintyAssessment = memory.uncertainty_assessment || {};

    return {
      memoryId: memory.id,
      content: memory.content,
      summary: memory.summary,
      category: memory.category,
      memoryType: memory.memory_type,
      owner: memory.owner,
      sourceType: memory.source_type,
      sourceTimestamp: memory.source_timestamp ? new Date(memory.source_timestamp) : undefined,
      provenance: memory.provenance,
      citationString: memory.citation_string || `Memory from ${this.formatDate(memory.created_at)}.`,
      confidence: memory.confidence || 0.5,
      importance: memory.importance || 0.5,
      trustLevel: memory.trust_level,
      retrievalConfidenceLabel: uncertaintyAssessment.confidence_label || 'grounded',
      uncertaintyReason: uncertaintyAssessment.uncertainty_reason,
      createdAt: new Date(memory.created_at),
      lastAccessedAt: memory.last_accessed_at ? new Date(memory.last_accessed_at) : undefined,
      accessCount: memory.access_count || 0,
      workspaceId: memory.workspace_id
    };
  }

  private rankMemories(memories: RetrievedMemory[], query: MemoryQuery): RetrievedMemory[] {
    return memories
      .map(memory => ({
        ...memory,
        relevanceScore: this.calculateRelevanceScore(memory, query)
      }))
      .sort((a, b) => {
        // Priority override: Identity and decisions always come first if relevant
        const aIsIdentity = memory => memory.category.includes('splendor.identity') || memory.category.includes('splendor.decisions');
        const bIsIdentity = memory => memory.category.includes('splendor.identity') || memory.category.includes('splendor.decisions');

        if (aIsIdentity(a) && !bIsIdentity(b)) return -1;
        if (!aIsIdentity(a) && bIsIdentity(b)) return 1;

        // Then sort by relevance score
        return (b as any).relevanceScore - (a as any).relevanceScore;
      })
      .filter(memory => {
        // Filter out uncertain memories if not allowed
        if (!query.allowWeaklyGrounded &&
            ['weakly_grounded', 'inferred', 'conflicting', 'stale', 'unverifiable'].includes(memory.retrievalConfidenceLabel)) {
          return false;
        }
        return true;
      });
  }

  private calculateRelevanceScore(memory: RetrievedMemory, query: MemoryQuery): number {
    // Multi-factor ranking: semantic similarity * 0.5 + importance * 0.3 + recency * 0.2
    // For now, using simplified scoring without semantic embeddings

    const importanceScore = memory.importance;
    const confidenceScore = memory.confidence;

    // Recency score (newer is better, but not too aggressive)
    const daysSinceCreated = (Date.now() - memory.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const recencyScore = Math.max(0, 1 - (daysSinceCreated / 365)); // Decays over a year

    // Workspace relevance boost
    const workspaceBoost = query.workspaceId && memory.workspaceId === query.workspaceId ? 0.2 : 0;

    // Uncertainty penalty
    const uncertaintyPenalty = memory.retrievalConfidenceLabel === 'grounded' ? 0 :
                               memory.retrievalConfidenceLabel === 'weakly_grounded' ? 0.1 :
                               0.3;

    // Simple semantic similarity approximation (would use real embeddings in production)
    const semanticScore = this.approximateSemanticSimilarity(memory.content, query.requestText);

    const finalScore = (
      semanticScore * 0.4 +
      importanceScore * 0.25 +
      confidenceScore * 0.2 +
      recencyScore * 0.15 +
      workspaceBoost
    ) - uncertaintyPenalty;

    return Math.max(0, Math.min(1, finalScore));
  }

  private approximateSemanticSimilarity(content: string, query: string): number {
    // Very simple keyword-based similarity for now
    // In production, you'd use proper semantic embeddings
    const contentWords = content.toLowerCase().split(/\s+/);
    const queryWords = query.toLowerCase().split(/\s+/);

    const intersection = contentWords.filter(word => queryWords.includes(word));
    const union = [...new Set([...contentWords, ...queryWords])];

    return intersection.length / Math.max(union.length, 1);
  }

  private formatDate(date: string | Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}

export { MemoryRetrievalServiceImpl };