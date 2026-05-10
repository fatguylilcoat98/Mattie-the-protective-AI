/**
 * MEMORY WRITE SERVICE
 * Single entry point for all memory writes
 * Enforces validation rules, provenance tracking, and approval workflows
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  MemoryWriteCommand,
  MemoryWriteResult,
  MemoryWriteService,
  ApprovalStatus,
  TrustLevel,
  Provenance,
  MemoryType
} from './memory-services';

export class MemoryWriteServiceImpl implements MemoryWriteService {
  private supabase: SupabaseClient;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async writeMemory(command: MemoryWriteCommand): Promise<MemoryWriteResult> {
    try {
      // Validate command
      const validation = await this.validateCommand(command);
      if (!validation.valid) {
        return {
          success: false,
          errors: validation.errors
        };
      }

      // Record the event first
      const eventId = await this.recordEvent(
        command.userId,
        `memory_write_${command.type}`,
        this.getActorFromCommand(command),
        this.getContentFromCommand(command),
        { command_type: command.type },
        this.getSourceTableFromCommand(command),
        this.getSourceIdFromCommand(command)
      );

      let result: MemoryWriteResult;

      // Route to appropriate handler
      switch (command.type) {
        case 'write_user_fact':
          result = await this.handleWriteUserFact(command, validation);
          break;
        case 'write_reflection':
          result = await this.handleWriteReflection(command, validation);
          break;
        case 'promote_memory':
          result = await this.handlePromoteMemory(command, validation);
          break;
        case 'write_decision':
          result = await this.handleWriteDecision(command, validation);
          break;
        case 'record_correction':
          result = await this.handleRecordCorrection(command, validation);
          break;
        default:
          throw new Error(`Unknown command type: ${(command as any).type}`);
      }

      // Log success event
      if (result.success) {
        await this.recordEvent(
          command.userId,
          'memory_written_success',
          'system',
          `Memory created: ${result.memoryId}`,
          { memory_id: result.memoryId, command_type: command.type, event_id: eventId }
        );
      }

      return result;

    } catch (error) {
      // Log error event
      await this.recordEvent(
        command.userId,
        'memory_write_error',
        'system',
        `Memory write failed: ${error.message}`,
        { command_type: command.type, error: error.message }
      );

      return {
        success: false,
        errors: [`Memory write failed: ${error.message}`]
      };
    }
  }

  private async handleWriteUserFact(
    command: any,
    validation: any
  ): Promise<MemoryWriteResult> {
    const { data: memoryItem, error } = await this.supabase
      .from('memory_items')
      .insert({
        user_id: command.userId,
        owner: 'chris',
        category: command.category,
        memory_type: command.memoryType,
        content: command.content,
        source_type: command.sourceType,
        source_id: command.sourceId,
        provenance: this.determineProvenance(command.sourceType),
        approval_status: validation.defaultApprovalStatus,
        trust_level: validation.defaultTrustLevel,
        retrieval_allowed: validation.retrievalAllowed,
        confidence: command.confidence || 0.5,
        importance: command.importance || 0.5,
        workspace_id: command.workspaceId
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create memory item: ${error.message}`);
    }

    // Create memory source record
    if (command.sourceId) {
      await this.supabase
        .from('memory_sources')
        .insert({
          memory_item_id: memoryItem.id,
          source_table: command.sourceType === 'conversation' ? 'conversations' : 'unknown',
          source_id: command.sourceId,
          source_excerpt: command.sourceExcerpt
        });
    }

    // Create verification request if needed
    let verificationRequestId: string | undefined;
    if (validation.defaultApprovalStatus === 'pending') {
      const { data: verificationRequest } = await this.supabase
        .from('verification_requests')
        .insert({
          user_id: command.userId,
          source_table: 'memory_items',
          source_id: memoryItem.id,
          proposed_memory_id: memoryItem.id,
          status: 'pending'
        })
        .select()
        .single();

      verificationRequestId = verificationRequest?.id;
    }

    return {
      success: true,
      memoryId: memoryItem.id,
      needsApproval: validation.defaultApprovalStatus === 'pending',
      verificationRequestId
    };
  }

  private async handleWriteReflection(
    command: any,
    validation: any
  ): Promise<MemoryWriteResult> {
    const { data: reflection, error } = await this.supabase
      .from('reflections')
      .insert({
        user_id: command.userId,
        reflection_type: command.reflectionType,
        summary: command.summary,
        what_i_noticed: command.whatINoticed,
        why_it_matters: command.whyItMatters,
        evidence_summary: command.evidenceSummary,
        source_interactions: command.sourceInteractions,
        source_memory_ids: command.sourceMemoryIds || [],
        confidence: command.confidence || 0.5,
        state: 'draft', // Always start as draft
        approval_status: 'staged' // Never auto-approve reflections
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create reflection: ${error.message}`);
    }

    return {
      success: true,
      memoryId: reflection.id,
      needsApproval: true, // Reflections always need approval
      warnings: ['Reflection created - requires approval before becoming trusted memory']
    };
  }

  private async handlePromoteMemory(
    command: any,
    validation: any
  ): Promise<MemoryWriteResult> {
    const { data: updatedMemory, error } = await this.supabase
      .from('memory_items')
      .update({
        approval_status: command.targetApprovalStatus,
        trust_level: command.targetApprovalStatus === 'approved' ? 'trusted' : 'caution',
        retrieval_allowed: command.targetApprovalStatus === 'approved',
        updated_at: new Date().toISOString()
      })
      .eq('id', command.sourceId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to promote memory: ${error.message}`);
    }

    // Record promotion audit trail
    await this.supabase
      .from('memory_promotions')
      .insert({
        user_id: command.userId,
        source_id: command.sourceId,
        source_table: command.sourceTable,
        target_id: command.sourceId,
        target_table: 'memory_items',
        promoted_by: command.promotedBy,
        reason: command.reason
      });

    return {
      success: true,
      memoryId: updatedMemory.id
    };
  }

  private async handleWriteDecision(
    command: any,
    validation: any
  ): Promise<MemoryWriteResult> {
    // Generate unique decision ID
    const decisionId = `D-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;

    const { data: decision, error } = await this.supabase
      .from('splendor_decisions')
      .insert({
        user_id: command.userId,
        decision_id: decisionId,
        title: command.title,
        decision: command.decision,
        context: command.context,
        reason: command.reason,
        priority: command.priority,
        binding: command.binding,
        created_by: 'Splendor'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create decision: ${error.message}`);
    }

    return {
      success: true,
      memoryId: decision.id
    };
  }

  private async handleRecordCorrection(
    command: any,
    validation: any
  ): Promise<MemoryWriteResult> {
    // First, supersede the original memory
    await this.supabase
      .from('memory_items')
      .update({ active: false })
      .eq('id', command.originalMemoryId);

    // Create corrected version
    const { data: originalMemory } = await this.supabase
      .from('memory_items')
      .select('*')
      .eq('id', command.originalMemoryId)
      .single();

    const { data: correctedMemory, error } = await this.supabase
      .from('memory_items')
      .insert({
        user_id: command.userId,
        owner: originalMemory.owner,
        category: originalMemory.category,
        memory_type: 'correction',
        content: command.correctedContent,
        source_type: command.sourceType,
        source_id: command.sourceId,
        provenance: 'USER_STATED',
        approval_status: 'approved', // Corrections from Chris are trusted
        trust_level: 'trusted',
        retrieval_allowed: true,
        confidence: 0.95,
        importance: originalMemory.importance,
        superseded_by: null // This is the new version
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create correction: ${error.message}`);
    }

    // Update original to point to correction
    await this.supabase
      .from('memory_items')
      .update({ superseded_by: correctedMemory.id })
      .eq('id', command.originalMemoryId);

    return {
      success: true,
      memoryId: correctedMemory.id
    };
  }

  async recordEvent(
    userId: string,
    eventType: string,
    actor: 'user' | 'splendor' | 'system' | 'tool' | 'scheduler',
    content?: string,
    metadata?: Record<string, any>,
    sourceTable?: string,
    sourceId?: string
  ): Promise<string> {
    const { data: event, error } = await this.supabase
      .from('raw_events')
      .insert({
        user_id: userId,
        event_type: eventType,
        actor,
        content,
        metadata: metadata || {},
        source_table: sourceTable,
        source_id: sourceId
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to record event: ${error.message}`);
    }

    return event.id;
  }

  async createMemoryConflict(
    userId: string,
    conflictType: string,
    memoryAId: string,
    memoryBId: string,
    description: string
  ): Promise<string> {
    const { data: conflict, error } = await this.supabase
      .from('memory_conflicts')
      .insert({
        user_id: userId,
        conflict_type: conflictType,
        memory_a_id: memoryAId,
        memory_b_id: memoryBId,
        description,
        status: 'unresolved'
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create memory conflict: ${error.message}`);
    }

    return conflict.id;
  }

  private async validateCommand(command: MemoryWriteCommand) {
    const errors: string[] = [];

    // Basic validation
    if (!command.userId) {
      errors.push('User ID is required');
    }

    // Type-specific validation
    switch (command.type) {
      case 'write_user_fact':
        if (!command.content?.trim()) {
          errors.push('Content is required for user facts');
        }
        if (!command.category) {
          errors.push('Category is required for user facts');
        }
        if (!command.memoryType) {
          errors.push('Memory type is required for user facts');
        }
        break;

      case 'write_reflection':
        if (!command.summary?.trim()) {
          errors.push('Summary is required for reflections');
        }
        if (!command.whatINoticed?.trim()) {
          errors.push('What I noticed is required for reflections');
        }
        if (!command.evidenceSummary?.trim()) {
          errors.push('Evidence summary is required for reflections');
        }
        if (!command.sourceInteractions?.length) {
          errors.push('Source interactions are required for reflections');
        }
        break;

      case 'write_decision':
        if (!command.title?.trim()) {
          errors.push('Title is required for decisions');
        }
        if (!command.decision?.trim()) {
          errors.push('Decision text is required');
        }
        if (!command.reason?.trim()) {
          errors.push('Reason is required for decisions');
        }
        break;
    }

    // Determine approval settings based on source
    let defaultApprovalStatus: ApprovalStatus = 'pending';
    let defaultTrustLevel: TrustLevel = 'caution';
    let retrievalAllowed = false;

    if (command.type === 'write_user_fact') {
      // Conservative approval for user facts
      if (command.sourceType === 'user_direct_statement' &&
          command.content && this.isConservativeUserStatement(command.content)) {
        defaultApprovalStatus = 'approved';
        defaultTrustLevel = 'trusted';
        retrievalAllowed = true;
      }
    }

    // Thought cycles and generated content must always be pending
    if (command.type === 'write_reflection' ||
        (command.sourceType && ['reflection', 'system_event'].includes(command.sourceType))) {
      defaultApprovalStatus = 'pending';
      defaultTrustLevel = 'caution';
      retrievalAllowed = false;
    }

    return {
      valid: errors.length === 0,
      errors,
      defaultApprovalStatus,
      defaultTrustLevel,
      retrievalAllowed
    };
  }

  private isConservativeUserStatement(content: string): boolean {
    const conservativePatterns = [
      /^I prefer /i,
      /^My name is /i,
      /^I like /i,
      /^My favorite /i,
      /^I was born /i,
      /^I live /i,
      /^I work /i
    ];

    return conservativePatterns.some(pattern => pattern.test(content.trim()));
  }

  private determineProvenance(sourceType: string): Provenance {
    switch (sourceType) {
      case 'user_direct_statement':
        return 'USER_STATED';
      case 'conversation':
        return 'splendor_conversation';
      case 'reflection':
        return 'INFERRED';
      case 'system_event':
        return 'SYSTEM_EVENT';
      case 'manual_admin':
        return 'ADMIN_APPROVED';
      case 'web_search':
      case 'external_search':
        return 'VERIFIED_FACT';
      default:
        return 'splendor_conversation';
    }
  }

  private getActorFromCommand(command: MemoryWriteCommand): 'user' | 'splendor' | 'system' | 'tool' | 'scheduler' {
    if (command.type === 'promote_memory') {
      return command.promotedBy === 'chris' ? 'user' : 'system';
    }
    if (command.type === 'record_correction') {
      return 'user'; // Corrections typically come from Chris
    }
    return 'splendor';
  }

  private getContentFromCommand(command: MemoryWriteCommand): string {
    switch (command.type) {
      case 'write_user_fact':
        return command.content;
      case 'write_reflection':
        return command.summary;
      case 'write_decision':
        return command.decision;
      case 'record_correction':
        return command.correctedContent;
      default:
        return 'Memory write operation';
    }
  }

  private getSourceTableFromCommand(command: MemoryWriteCommand): string | undefined {
    if ('sourceId' in command && command.sourceId) {
      return 'conversations'; // Most common case
    }
    return undefined;
  }

  private getSourceIdFromCommand(command: MemoryWriteCommand): string | undefined {
    if ('sourceId' in command) {
      return command.sourceId;
    }
    return undefined;
  }
}

export { MemoryWriteServiceImpl };