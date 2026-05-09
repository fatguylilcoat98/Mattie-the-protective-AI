/**
 * SPLENDOR MEMORY SERVICES V2.0
 * Built by Christopher Hughes · Sacramento, CA
 * Created with Claude Code
 * Truth · Safety · We Got Your Back
 *
 * Core Principle: One way in, one way out
 * - MemoryWriteService: Single entry point for all memory writes
 * - MemoryRetrievalService: Single exit point for all memory reads
 * - PineconeSyncService: Maintains Pinecone as pure search index
 */

// ═══════════════════════════════════════════════════════════════════════════════
// CORE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type MemoryOwner = 'chris' | 'splendor' | 'shared' | 'system';
export type MemoryType =
  | 'user_fact'
  | 'user_preference'
  | 'user_goal'
  | 'project_context'
  | 'shared_history'
  | 'splendor_identity'
  | 'splendor_reflection'
  | 'binding_rule'
  | 'relationship_context'
  | 'technical_context'
  | 'task_context'
  | 'correction'
  | 'insight';

export type SourceType =
  | 'conversation'
  | 'user_direct_statement'
  | 'assistant_response'
  | 'reflection'
  | 'decision'
  | 'system_event'
  | 'email'
  | 'manual_admin'
  | 'imported_memory';

export type Provenance =
  | 'USER_STATED'
  | 'VERIFIED_FACT'
  | 'INFERRED'
  | 'GENERATED'
  | 'SYSTEM_EVENT'
  | 'ADMIN_APPROVED';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'archived';
export type TrustLevel = 'trusted' | 'caution' | 'untrusted' | 'reference_only';

// NEW: Memory uncertainty flagging
export type RetrievalConfidenceLabel =
  | 'grounded'
  | 'weakly_grounded'
  | 'inferred'
  | 'conflicting'
  | 'stale'
  | 'unverifiable';

export type RequestContext =
  | 'answer_user_question'
  | 'continue_workspace'
  | 'plan_email'
  | 'draft_message'
  | 'reflection_cycle'
  | 'admin_review';

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY WRITE SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export interface WriteUserFactCommand {
  type: 'write_user_fact';
  userId: string;
  content: string;
  category: string;
  memoryType: MemoryType;
  sourceType: SourceType;
  sourceId?: string;
  sourceExcerpt?: string;
  workspaceId?: string;
  confidence?: number;
  importance?: number;
}

export interface WriteReflectionCommand {
  type: 'write_reflection';
  userId: string;
  reflectionType: string;
  summary: string;
  whatINoticed: string;
  whyItMatters?: string;
  evidenceSummary: string;
  sourceInteractions: string[];
  sourceMemoryIds?: string[];
  confidence?: number;
  workspaceId?: string;
}

export interface PromoteMemoryCommand {
  type: 'promote_memory';
  userId: string;
  sourceTable: string;
  sourceId: string;
  targetApprovalStatus: ApprovalStatus;
  promotedBy: 'chris' | 'system' | 'splendor';
  reason: string;
}

export interface WriteDecisionCommand {
  type: 'write_decision';
  userId: string;
  title: string;
  decision: string;
  context: string;
  reason: string;
  priority: 'CORE' | 'HIGH' | 'MEDIUM' | 'LOW';
  binding: boolean;
}

export interface RecordCorrectionCommand {
  type: 'record_correction';
  userId: string;
  originalMemoryId: string;
  correctedContent: string;
  correctionReason: string;
  sourceType: SourceType;
  sourceId?: string;
}

export type MemoryWriteCommand =
  | WriteUserFactCommand
  | WriteReflectionCommand
  | PromoteMemoryCommand
  | WriteDecisionCommand
  | RecordCorrectionCommand;

export interface MemoryWriteResult {
  success: boolean;
  memoryId?: string;
  errors?: string[];
  warnings?: string[];
  needsApproval?: boolean;
  verificationRequestId?: string;
}

export interface MemoryWriteService {
  /**
   * Single entry point for all memory writes
   * Enforces validation rules based on command type and source
   */
  writeMemory(command: MemoryWriteCommand): Promise<MemoryWriteResult>;

  /**
   * Record raw event for everything that happens
   */
  recordEvent(
    userId: string,
    eventType: string,
    actor: 'user' | 'splendor' | 'system' | 'tool' | 'scheduler',
    content?: string,
    metadata?: Record<string, any>,
    sourceTable?: string,
    sourceId?: string
  ): Promise<string>;

  /**
   * Create memory conflict when conflicting information detected
   */
  createMemoryConflict(
    userId: string,
    conflictType: string,
    memoryAId: string,
    memoryBId: string,
    description: string
  ): Promise<string>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEMORY RETRIEVAL SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export interface RetrievedMemory {
  memoryId: string;
  content: string;
  summary?: string;
  category: string;
  memoryType: MemoryType;
  owner: MemoryOwner;

  // Source and provenance
  sourceType: SourceType;
  sourceTimestamp?: Date;
  provenance: Provenance;
  citationString: string;

  // Confidence and trust
  confidence: number;
  importance: number;
  trustLevel: TrustLevel;

  // NEW: Uncertainty flagging
  retrievalConfidenceLabel: RetrievalConfidenceLabel;
  uncertaintyReason?: string;

  // Metadata
  createdAt: Date;
  lastAccessedAt?: Date;
  accessCount: number;
  workspaceId?: string;
}

export interface RetrievedReflection {
  reflectionId: string;
  reflectionType: string;
  summary: string;
  whatINoticed: string;
  whyItMatters?: string;
  confidence?: number;

  // Always labeled as interpretation
  isInterpretation: true;
  citationString: string;

  createdAt: Date;
}

export interface RetrievedDecision {
  decisionId: string;
  title: string;
  decision: string;
  context: string;
  reason: string;
  priority: 'CORE' | 'HIGH' | 'MEDIUM' | 'LOW';
  binding: boolean;
  citationString: string;
  createdAt: Date;
}

export interface WorkspaceContext {
  workspaceId: string;
  title: string;
  objective: string;
  currentState: string;
  openQuestions: any[];
  nextSteps: any[];
  lastWorkedAt: Date;
}

export interface RetrievalContext {
  // Core context (always included)
  governingRules: RetrievedDecision[];
  workspaceState?: WorkspaceContext;

  // Retrieved memories with uncertainty labels
  facts: RetrievedMemory[];
  interpretations: RetrievedReflection[];

  // Session context
  recentMessages: any[];
  activeTaskContext?: any;
}

export interface MemoryQuery {
  userId: string;
  requestText: string;
  requestContext: RequestContext;
  sessionId?: string;
  workspaceId?: string;

  // Filtering options
  memoryTypes?: MemoryType[];
  categories?: string[];
  maxResults?: number;
  includeReflections?: boolean;

  // Confidence thresholds
  minConfidence?: number;
  minImportance?: number;
  allowWeaklyGrounded?: boolean;
}

export interface MemoryRetrievalService {
  /**
   * Main retrieval orchestrator
   * Implements contextual resonance logic with uncertainty flagging
   */
  retrieveMemoryContext(query: MemoryQuery): Promise<RetrievalContext>;

  /**
   * Search and rank memories with uncertainty assessment
   */
  searchMemories(
    userId: string,
    queryText: string,
    filters?: {
      categories?: string[];
      memoryTypes?: MemoryType[];
      minConfidence?: number;
      workspaceId?: string;
    }
  ): Promise<RetrievedMemory[]>;

  /**
   * Get active binding decisions (always retrieved)
   */
  getActiveDecisions(userId: string): Promise<RetrievedDecision[]>;

  /**
   * Log memory access for tracking
   */
  logMemoryAccess(
    userId: string,
    memoryId: string,
    requestContext: RequestContext,
    reasonUsed: string,
    conversationId?: string,
    workspaceId?: string
  ): Promise<void>;

  /**
   * Assess retrieval confidence for uncertainty flagging
   */
  assessRetrievalConfidence(
    memory: any,
    queryContext: MemoryQuery
  ): {
    label: RetrievalConfidenceLabel;
    reason?: string;
    citationString: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PINECONE SYNC SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export interface PineconeRecord {
  vectorId: string;
  namespace: string;
  embedding: number[];
  metadata: {
    userId: string;
    sourceTable: string;
    sourceId: string;
    memoryType?: MemoryType;
    category?: string;
    provenance?: Provenance;
    approvalStatus?: ApprovalStatus;
    createdAt?: string;
    importance?: number;
  };
}

export interface PineconeSyncService {
  /**
   * Index approved memory into Pinecone
   */
  indexMemory(
    userId: string,
    sourceTable: string,
    sourceId: string,
    content: string,
    metadata: Record<string, any>
  ): Promise<string>;

  /**
   * Search Pinecone and return IDs only
   */
  searchSimilar(
    userId: string,
    queryText: string,
    namespace?: string,
    filters?: Record<string, any>,
    limit?: number
  ): Promise<{
    vectorId: string;
    sourceTable: string;
    sourceId: string;
    score: number;
  }[]>;

  /**
   * Mark Pinecone record as stale when source updates
   */
  markStale(
    userId: string,
    sourceTable: string,
    sourceId: string
  ): Promise<void>;

  /**
   * Delete from Pinecone when memory deleted
   */
  deleteRecord(
    userId: string,
    sourceTable: string,
    sourceId: string
  ): Promise<void>;

  /**
   * Sync stale records (background process)
   */
  syncStaleRecords(userId?: string): Promise<{
    updated: number;
    deleted: number;
    errors: string[];
  }>;

  /**
   * Reset user namespace (for memory wipes)
   */
  resetUserNamespace(userId: string): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VALIDATION RULES
// ═══════════════════════════════════════════════════════════════════════════════

export interface MemoryValidationRules {
  /**
   * Validate write command based on source and type
   */
  validateWriteCommand(command: MemoryWriteCommand): {
    valid: boolean;
    errors: string[];
    defaultApprovalStatus: ApprovalStatus;
    defaultTrustLevel: TrustLevel;
    retrievalAllowed: boolean;
  };

  /**
   * Check if memory conflicts with existing memories
   */
  checkForConflicts(
    userId: string,
    newContent: string,
    category: string,
    memoryType: MemoryType
  ): Promise<{
    hasConflicts: boolean;
    conflictingMemoryIds: string[];
    conflictDescription?: string;
  }>;

  /**
   * Determine if memory needs human approval
   */
  needsApproval(
    sourceType: SourceType,
    provenance: Provenance,
    memoryType: MemoryType,
    content: string
  ): boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNCERTAINTY ASSESSMENT LOGIC
// ═══════════════════════════════════════════════════════════════════════════════

export interface UncertaintyAssessment {
  /**
   * Assess memory uncertainty and generate appropriate labels
   */
  assessMemoryUncertainty(
    memory: any,
    retrievalContext: MemoryQuery
  ): {
    confidenceLabel: RetrievalConfidenceLabel;
    uncertaintyReason?: string;
    shouldFlag: boolean;
    recommendedPhrasing?: string;
  };

  /**
   * Generate citation string for memory
   */
  generateCitationString(
    memory: any,
    includeUncertaintyWarning: boolean
  ): string;

  /**
   * Check for memory conflicts during retrieval
   */
  checkRetrievalConflicts(
    memories: RetrievedMemory[]
  ): {
    hasConflicts: boolean;
    conflictingMemoryIds: string[];
    conflictDescription: string;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// WORKSPACE AND CONTINUITY SERVICES
// ═══════════════════════════════════════════════════════════════════════════════

export interface WorkspaceService {
  /**
   * Create or update active workspace
   */
  createWorkspace(
    userId: string,
    title: string,
    objective: string,
    relatedMemoryIds?: string[]
  ): Promise<string>;

  /**
   * Update workspace state
   */
  updateWorkspace(
    workspaceId: string,
    updates: {
      currentState?: string;
      openQuestions?: any[];
      nextSteps?: any[];
      status?: string;
    }
  ): Promise<void>;

  /**
   * Get workspace context for continuity
   */
  getWorkspaceContext(workspaceId: string): Promise<WorkspaceContext>;

  /**
   * Archive completed workspace
   */
  archiveWorkspace(
    workspaceId: string,
    summary: string
  ): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE FACTORY
// ═══════════════════════════════════════════════════════════════════════════════

export interface MemoryServiceConfig {
  supabaseUrl: string;
  supabaseKey: string;
  pineconeApiKey: string;
  pineconeEnvironment: string;
  pineconeIndexName: string;
  anthropicApiKey?: string;
}

export interface MemoryServices {
  write: MemoryWriteService;
  retrieval: MemoryRetrievalService;
  pinecone: PineconeSyncService;
  workspace: WorkspaceService;
  validation: MemoryValidationRules;
  uncertainty: UncertaintyAssessment;
}

export function createMemoryServices(config: MemoryServiceConfig): MemoryServices;

// ═══════════════════════════════════════════════════════════════════════════════
// USAGE EXAMPLES
// ═══════════════════════════════════════════════════════════════════════════════

/*
// EXAMPLE 1: User states a preference
const writeResult = await memoryServices.write.writeMemory({
  type: 'write_user_fact',
  userId: 'user-123',
  content: 'I prefer dark roast coffee',
  category: 'chris.preferences',
  memoryType: 'user_preference',
  sourceType: 'user_direct_statement',
  sourceId: 'conversation-abc',
  confidence: 0.95,
  importance: 0.6
});

// EXAMPLE 2: Retrieve memory with uncertainty flagging
const context = await memoryServices.retrieval.retrieveMemoryContext({
  userId: 'user-123',
  requestText: 'What coffee do I like?',
  requestContext: 'answer_user_question',
  maxResults: 10,
  allowWeaklyGrounded: false
});

// EXAMPLE 3: Handle uncertain memory in response
context.facts.forEach(memory => {
  if (memory.retrievalConfidenceLabel !== 'grounded') {
    console.log(`⚠️ Uncertain memory: ${memory.content}`);
    console.log(`Reason: ${memory.uncertaintyReason}`);
    console.log(`Citation: ${memory.citationString}`);
  }
});

// EXAMPLE 4: Promote reflection to approved memory
await memoryServices.write.writeMemory({
  type: 'promote_memory',
  userId: 'user-123',
  sourceTable: 'reflections',
  sourceId: 'reflection-xyz',
  targetApprovalStatus: 'approved',
  promotedBy: 'chris',
  reason: 'Chris confirmed this insight is accurate'
});
*/