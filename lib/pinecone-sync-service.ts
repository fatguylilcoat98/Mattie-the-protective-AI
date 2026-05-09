/**
 * PINECONE SYNC SERVICE
 * Maintains Pinecone as pure semantic search index
 * Supabase is always the canonical source of truth
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PineconeSyncService, PineconeRecord } from './memory-services';

export class PineconeSyncServiceImpl implements PineconeSyncService {
  private pinecone: Pinecone;
  private supabase: SupabaseClient;
  private indexName: string;

  constructor(
    pineconeApiKey: string,
    supabaseUrl: string,
    supabaseKey: string,
    indexName: string
  ) {
    this.pinecone = new Pinecone({
      apiKey: pineconeApiKey
    });
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.indexName = indexName;
  }

  async indexMemory(
    userId: string,
    sourceTable: string,
    sourceId: string,
    content: string,
    metadata: Record<string, any>
  ): Promise<string> {
    try {
      // Generate embedding (you'd replace this with your actual embedding service)
      const embedding = await this.generateEmbedding(content);

      // Create vector ID
      const vectorId = `${sourceTable}-${sourceId}`;
      const namespace = `user-${userId}-semantic`;

      // Get Pinecone index
      const index = this.pinecone.index(this.indexName);

      // Prepare vector with metadata
      const vector = {
        id: vectorId,
        values: embedding,
        metadata: {
          userId,
          sourceTable,
          sourceId,
          content: content.substring(0, 1000), // Truncate for metadata
          ...metadata,
          indexedAt: new Date().toISOString()
        }
      };

      // Upsert to Pinecone
      await index.namespace(namespace).upsert([vector]);

      // Create content hash for sync tracking
      const contentHash = await this.hashContent(content + JSON.stringify(metadata));

      // Record in Supabase
      await this.supabase
        .from('pinecone_index_records')
        .upsert({
          user_id: userId,
          [sourceTable === 'memory_items' ? 'memory_item_id' :
           sourceTable === 'reflections' ? 'reflection_id' :
           sourceTable === 'active_workspaces' ? 'workspace_id' : 'memory_item_id']: sourceId,
          pinecone_vector_id: vectorId,
          namespace,
          indexed_content_hash: contentHash,
          indexed_at: new Date().toISOString(),
          sync_status: 'synced'
        }, {
          onConflict: 'pinecone_vector_id'
        });

      return vectorId;

    } catch (error) {
      // Mark as failed in tracking table
      await this.supabase
        .from('pinecone_index_records')
        .upsert({
          user_id: userId,
          pinecone_vector_id: `${sourceTable}-${sourceId}`,
          namespace: `user-${userId}-semantic`,
          indexed_content_hash: 'FAILED',
          sync_status: 'failed'
        });

      throw new Error(`Failed to index memory in Pinecone: ${error.message}`);
    }
  }

  async searchSimilar(
    userId: string,
    queryText: string,
    namespace?: string,
    filters?: Record<string, any>,
    limit: number = 10
  ): Promise<{
    vectorId: string;
    sourceTable: string;
    sourceId: string;
    score: number;
  }[]> {
    try {
      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(queryText);

      // Use namespace
      const searchNamespace = namespace || `user-${userId}-semantic`;
      const index = this.pinecone.index(this.indexName);

      // Build filter for Pinecone metadata
      const pineconeFilter: Record<string, any> = {
        userId: { $eq: userId },
        ...filters
      };

      // Search Pinecone
      const searchResponse = await index.namespace(searchNamespace).query({
        vector: queryEmbedding,
        topK: limit,
        includeMetadata: true,
        filter: pineconeFilter
      });

      // Map results to return format (IDs only, as per architecture)
      return searchResponse.matches?.map(match => ({
        vectorId: match.id,
        sourceTable: match.metadata?.sourceTable as string,
        sourceId: match.metadata?.sourceId as string,
        score: match.score || 0
      })) || [];

    } catch (error) {
      console.error('Pinecone search failed:', error);
      // Return empty results rather than failing completely
      return [];
    }
  }

  async markStale(
    userId: string,
    sourceTable: string,
    sourceId: string
  ): Promise<void> {
    await this.supabase
      .from('pinecone_index_records')
      .update({ sync_status: 'stale' })
      .eq('user_id', userId)
      .eq('pinecone_vector_id', `${sourceTable}-${sourceId}`);
  }

  async deleteRecord(
    userId: string,
    sourceTable: string,
    sourceId: string
  ): Promise<void> {
    try {
      const vectorId = `${sourceTable}-${sourceId}`;
      const namespace = `user-${userId}-semantic`;

      // Delete from Pinecone
      const index = this.pinecone.index(this.indexName);
      await index.namespace(namespace).deleteOne(vectorId);

      // Update tracking record
      await this.supabase
        .from('pinecone_index_records')
        .update({ sync_status: 'deleted' })
        .eq('pinecone_vector_id', vectorId);

    } catch (error) {
      console.error('Failed to delete from Pinecone:', error);
      // Mark as failed rather than throwing
      await this.supabase
        .from('pinecone_index_records')
        .update({ sync_status: 'failed' })
        .eq('pinecone_vector_id', `${sourceTable}-${sourceId}`);
    }
  }

  async syncStaleRecords(userId?: string): Promise<{
    updated: number;
    deleted: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let updated = 0;
    let deleted = 0;

    try {
      // Get stale records
      let query = this.supabase
        .from('pinecone_index_records')
        .select('*')
        .eq('sync_status', 'stale');

      if (userId) {
        query = query.eq('user_id', userId);
      }

      const { data: staleRecords, error } = await query;

      if (error) {
        errors.push(`Failed to get stale records: ${error.message}`);
        return { updated, deleted, errors };
      }

      for (const record of staleRecords || []) {
        try {
          // Get current content from Supabase
          const sourceData = await this.getSourceContent(
            record.memory_item_id || record.reflection_id || record.workspace_id,
            record.memory_item_id ? 'memory_items' :
            record.reflection_id ? 'reflections' : 'active_workspaces'
          );

          if (!sourceData) {
            // Source was deleted, delete from Pinecone
            await this.deleteRecord(
              record.user_id,
              record.memory_item_id ? 'memory_items' :
              record.reflection_id ? 'reflections' : 'active_workspaces',
              record.memory_item_id || record.reflection_id || record.workspace_id
            );
            deleted++;
            continue;
          }

          // Check if content changed
          const currentHash = await this.hashContent(
            sourceData.content + JSON.stringify(sourceData.metadata || {})
          );

          if (currentHash !== record.indexed_content_hash) {
            // Re-index with updated content
            await this.indexMemory(
              record.user_id,
              record.memory_item_id ? 'memory_items' :
              record.reflection_id ? 'reflections' : 'active_workspaces',
              record.memory_item_id || record.reflection_id || record.workspace_id,
              sourceData.content,
              sourceData.metadata || {}
            );
            updated++;
          } else {
            // Just mark as synced (was stale but content is same)
            await this.supabase
              .from('pinecone_index_records')
              .update({ sync_status: 'synced' })
              .eq('id', record.id);
          }

        } catch (recordError) {
          errors.push(`Failed to sync record ${record.id}: ${recordError.message}`);
        }
      }

    } catch (error) {
      errors.push(`Sync process failed: ${error.message}`);
    }

    return { updated, deleted, errors };
  }

  async resetUserNamespace(userId: string): Promise<void> {
    try {
      const namespace = `user-${userId}-semantic`;
      const index = this.pinecone.index(this.indexName);

      // Delete entire namespace
      await index.namespace(namespace).deleteAll();

      // Update all tracking records for this user
      await this.supabase
        .from('pinecone_index_records')
        .update({ sync_status: 'deleted' })
        .eq('user_id', userId);

    } catch (error) {
      throw new Error(`Failed to reset user namespace: ${error.message}`);
    }
  }

  private async getSourceContent(sourceId: string, sourceTable: string) {
    let query;
    switch (sourceTable) {
      case 'memory_items':
        query = this.supabase
          .from('memory_items')
          .select('content, category, memory_type, confidence, importance')
          .eq('id', sourceId)
          .single();
        break;
      case 'reflections':
        query = this.supabase
          .from('reflections')
          .select('summary as content, reflection_type, confidence')
          .eq('id', sourceId)
          .single();
        break;
      case 'active_workspaces':
        query = this.supabase
          .from('active_workspaces')
          .select('title, objective, current_state')
          .eq('id', sourceId)
          .single();
        break;
      default:
        return null;
    }

    const { data, error } = await query;
    if (error || !data) return null;

    // For workspaces, combine title + objective + state as content
    if (sourceTable === 'active_workspaces') {
      data.content = `${data.title}: ${data.objective}. Current state: ${data.current_state}`;
    }

    return data;
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // PLACEHOLDER: Replace with your actual embedding service
    // This could be OpenAI embeddings, Cohere, or local models

    // For demo purposes, returning a mock embedding
    // In production, you'd call something like:
    // const response = await openai.embeddings.create({
    //   model: "text-embedding-3-small",
    //   input: text
    // });
    // return response.data[0].embedding;

    // Mock embedding (768-dimensional)
    const embedding = new Array(768).fill(0).map(() => Math.random() - 0.5);
    return embedding;
  }

  private async hashContent(content: string): Promise<string> {
    // Simple hash function (in production, use crypto.subtle or similar)
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }
}

/**
 * INTEGRATION WITH MEMORY SERVICES
 * This service should be called by MemoryWriteService when:
 * - A memory is approved (index it)
 * - A memory is updated (mark stale, then re-index)
 * - A memory is deleted (delete from Pinecone)
 *
 * And by MemoryRetrievalService for semantic search
 */

export { PineconeSyncServiceImpl };