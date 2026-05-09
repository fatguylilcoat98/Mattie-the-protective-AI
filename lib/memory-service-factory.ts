/**
 * MEMORY SERVICE FACTORY
 * Creates and configures all memory services with proper dependencies
 */

import { MemoryWriteServiceImpl } from './memory-write-service';
import { MemoryRetrievalServiceImpl } from './memory-retrieval-service';
import { PineconeSyncServiceImpl } from './pinecone-sync-service';
import {
  MemoryServices,
  MemoryServiceConfig,
  MemoryValidationRules,
  UncertaintyAssessment,
  WorkspaceService
} from './memory-services';

export class MemoryValidationRulesImpl implements MemoryValidationRules {
  constructor(private supabase: any) {}

  validateWriteCommand(command: any) {
    // Implementation would go here
    // This is handled in MemoryWriteService for now
    return {
      valid: true,
      errors: [],
      defaultApprovalStatus: 'pending' as any,
      defaultTrustLevel: 'caution' as any,
      retrievalAllowed: false
    };
  }

  async checkForConflicts(
    userId: string,
    newContent: string,
    category: string,
    memoryType: any
  ) {
    // Basic conflict detection
    const { data: existingMemories } = await this.supabase
      .from('memory_items')
      .select('id, content')
      .eq('user_id', userId)
      .eq('category', category)
      .eq('memory_type', memoryType)
      .eq('active', true);

    const conflicts = existingMemories?.filter(memory =>
      this.calculateSimilarity(memory.content, newContent) > 0.8
    ) || [];

    return {
      hasConflicts: conflicts.length > 0,
      conflictingMemoryIds: conflicts.map(m => m.id),
      conflictDescription: conflicts.length > 0 ?
        `Similar memory already exists: "${conflicts[0].content.substring(0, 100)}..."` : undefined
    };
  }

  needsApproval(sourceType: any, provenance: any, memoryType: any, content: string): boolean {
    // Generated content always needs approval
    if (provenance === 'GENERATED' || provenance === 'INFERRED') {
      return true;
    }

    // System events don't need approval but can't become personal memory
    if (provenance === 'SYSTEM_EVENT') {
      return false; // They're just archived
    }

    // User statements for basic facts can be auto-approved if conservative
    if (provenance === 'USER_STATED' && this.isConservativeStatement(content)) {
      return false;
    }

    // Everything else needs review
    return true;
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // Simple similarity check - in production use proper semantic comparison
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    const intersection = words1.filter(w => words2.includes(w));
    return intersection.length / Math.max(words1.length, words2.length);
  }

  private isConservativeStatement(content: string): boolean {
    const conservativePatterns = [
      /^I prefer /i, /^My name is /i, /^I like /i, /^My favorite /i,
      /^I was born /i, /^I live /i, /^I work /i
    ];
    return conservativePatterns.some(pattern => pattern.test(content.trim()));
  }
}

export class UncertaintyAssessmentImpl implements UncertaintyAssessment {
  assessMemoryUncertainty(memory: any, retrievalContext: any) {
    // This logic is implemented in the database function
    // but we can add client-side assessment here too
    const uncertaintyAssessment = memory.uncertainty_assessment || {};

    return {
      confidenceLabel: uncertaintyAssessment.confidence_label || 'grounded',
      uncertaintyReason: uncertaintyAssessment.uncertainty_reason,
      shouldFlag: uncertaintyAssessment.should_flag || false,
      recommendedPhrasing: this.getRecommendedPhrasing(uncertaintyAssessment.confidence_label)
    };
  }

  generateCitationString(memory: any, includeUncertaintyWarning: boolean): string {
    // Use the database-generated citation string
    return memory.citation_string || `Memory from ${new Date(memory.created_at).toLocaleDateString()}.`;
  }

  checkRetrievalConflicts(memories: any[]) {
    // Check for conflicts between retrieved memories
    const conflicts: string[] = [];
    const conflictingMemoryIds: string[] = [];

    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const memA = memories[i];
        const memB = memories[j];

        if (memA.category === memB.category &&
            memA.memory_type === memB.memory_type &&
            this.hasContentConflict(memA.content, memB.content)) {
          conflicts.push(`Conflicting information about ${memA.category}: "${memA.content.substring(0, 50)}..." vs "${memB.content.substring(0, 50)}..."`);
          conflictingMemoryIds.push(memA.memoryId, memB.memoryId);
        }
      }
    }

    return {
      hasConflicts: conflicts.length > 0,
      conflictingMemoryIds: [...new Set(conflictingMemoryIds)],
      conflictDescription: conflicts.join('; ')
    };
  }

  private getRecommendedPhrasing(confidenceLabel: string): string {
    switch (confidenceLabel) {
      case 'weakly_grounded':
        return "I'm not fully grounded on this, but I think";
      case 'inferred':
        return "I remember something related, but I want to flag this as my interpretation:";
      case 'conflicting':
        return "I have conflicting information about this, but one memory suggests";
      case 'stale':
        return "This memory is older and I haven't validated it recently, but";
      case 'unverifiable':
        return "I don't have a strong source for this memory, so let me flag it as uncertain:";
      default:
        return "";
    }
  }

  private hasContentConflict(content1: string, content2: string): boolean {
    // Simple conflict detection - look for opposing statements
    const opposingPairs = [
      ['like', 'dislike'], ['prefer', 'avoid'], ['love', 'hate'],
      ['yes', 'no'], ['is', 'is not'], ['can', 'cannot']
    ];

    return opposingPairs.some(([pos, neg]) =>
      (content1.toLowerCase().includes(pos) && content2.toLowerCase().includes(neg)) ||
      (content1.toLowerCase().includes(neg) && content2.toLowerCase().includes(pos))
    );
  }
}

export class WorkspaceServiceImpl implements WorkspaceService {
  constructor(private supabase: any) {}

  async createWorkspace(
    userId: string,
    title: string,
    objective: string,
    relatedMemoryIds?: string[]
  ): Promise<string> {
    const { data: workspace, error } = await this.supabase
      .from('active_workspaces')
      .insert({
        user_id: userId,
        title,
        objective,
        related_memory_ids: relatedMemoryIds || [],
        status: 'active',
        priority: 'medium'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create workspace: ${error.message}`);
    }

    return workspace.id;
  }

  async updateWorkspace(workspaceId: string, updates: any): Promise<void> {
    const { error } = await this.supabase
      .from('active_workspaces')
      .update({
        ...updates,
        last_worked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', workspaceId);

    if (error) {
      throw new Error(`Failed to update workspace: ${error.message}`);
    }
  }

  async getWorkspaceContext(workspaceId: string) {
    const { data: workspace, error } = await this.supabase
      .from('active_workspaces')
      .select('*')
      .eq('id', workspaceId)
      .single();

    if (error) {
      throw new Error(`Failed to get workspace: ${error.message}`);
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

  async archiveWorkspace(workspaceId: string, summary: string): Promise<void> {
    await this.supabase
      .from('active_workspaces')
      .update({
        status: 'archived',
        current_state: summary,
        updated_at: new Date().toISOString()
      })
      .eq('id', workspaceId);
  }
}

export function createMemoryServices(config: MemoryServiceConfig): MemoryServices {
  // Create core services
  const writeService = new MemoryWriteServiceImpl(config.supabaseUrl, config.supabaseKey);
  const retrievalService = new MemoryRetrievalServiceImpl(config.supabaseUrl, config.supabaseKey);
  const pineconeService = new PineconeSyncServiceImpl(
    config.pineconeApiKey,
    config.supabaseUrl,
    config.supabaseKey,
    config.pineconeIndexName
  );

  // Create Supabase client for helper services
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(config.supabaseUrl, config.supabaseKey);

  // Create helper services
  const workspaceService = new WorkspaceServiceImpl(supabase);
  const validationService = new MemoryValidationRulesImpl(supabase);
  const uncertaintyService = new UncertaintyAssessmentImpl();

  return {
    write: writeService,
    retrieval: retrievalService,
    pinecone: pineconeService,
    workspace: workspaceService,
    validation: validationService,
    uncertainty: uncertaintyService
  };
}

/**
 * USAGE EXAMPLE
 */
export async function initializeMemorySystem(config: MemoryServiceConfig) {
  const services = createMemoryServices(config);

  // Test the system
  console.log('Memory services initialized successfully');

  return services;
}

export { MemoryWriteServiceImpl, MemoryRetrievalServiceImpl, PineconeSyncServiceImpl };