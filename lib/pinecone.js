/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const { Pinecone } = require('@pinecone-database/pinecone');
const Anthropic = require('@anthropic-ai/sdk');

if (!process.env.PINECONE_API_KEY) {
  console.warn('PINECONE_API_KEY not found - semantic memory will be disabled');
}

const pc = process.env.PINECONE_API_KEY ? new Pinecone({ apiKey: process.env.PINECONE_API_KEY }) : null;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const INDEX_NAME = process.env.PINECONE_INDEX || 'splendor-memory';

async function getIndex() {
  if (!pc) {
    throw new Error('Pinecone not configured');
  }
  return pc.index(INDEX_NAME);
}

// Generate embedding using Anthropic's embedding endpoint
async function embed(text) {
  try {
    // Note: Using a more basic approach since Anthropic doesn't have a direct embedding endpoint
    // We'll use a simple text processing approach for now
    // In production, you might want to use OpenAI's embedding API or another provider

    // For now, let's create a simple hash-based approach for development
    // This can be replaced with actual embeddings in production
    const hash = await createSimpleEmbedding(text);
    return hash;
  } catch (error) {
    console.error('Embedding error:', error);
    throw error;
  }
}

// Simple embedding simulation for development
// Replace this with actual embedding service in production
async function createSimpleEmbedding(text) {
  // Create a consistent 1024-dimensional vector from text
  const words = text.toLowerCase().split(/\s+/);
  const vector = new Array(1024).fill(0);

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    let hash = 0;
    for (let j = 0; j < word.length; j++) {
      hash = ((hash << 5) - hash + word.charCodeAt(j)) & 0xffffffff;
    }
    const index = Math.abs(hash) % 1024;
    vector[index] += 1 / Math.sqrt(words.length);
  }

  // Normalize vector
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
}

// Store a memory in Pinecone
async function storeMemory(memoryId, content, userId, memoryType) {
  try {
    if (!pc) {
      console.log('Pinecone not configured, skipping semantic storage');
      return;
    }

    const index = await getIndex();
    const vector = await embed(content);

    await index.upsert([{
      id: memoryId,
      values: vector,
      metadata: {
        userId,
        content: content.substring(0, 500), // Limit metadata size
        memoryType,
        createdAt: new Date().toISOString()
      }
    }]);

    console.log(`Memory stored in Pinecone: ${memoryId}`);
  } catch (error) {
    console.error('Pinecone storage error:', error);
    // Don't throw - this shouldn't break the app if Pinecone fails
  }
}

// Retrieve semantically relevant memories for a user
async function retrieveMemories(query, userId, topK = 5) {
  try {
    if (!pc) {
      console.log('Pinecone not configured, semantic search disabled');
      return [];
    }

    const index = await getIndex();
    const vector = await embed(query);

    const results = await index.query({
      vector,
      topK,
      filter: { userId },
      includeMetadata: true
    });

    return results.matches
      .filter(m => m.score > 0.1) // Only return reasonably relevant matches
      .map(m => ({
        content: m.metadata.content,
        type: m.metadata.memoryType,
        score: m.score,
        createdAt: m.metadata.createdAt
      }));
  } catch (error) {
    console.error('Pinecone retrieval error:', error);
    return [];
  }
}

// Delete a memory from Pinecone
async function deleteMemory(memoryId) {
  try {
    if (!pc) return;

    const index = await getIndex();
    await index.deleteOne(memoryId);

    console.log(`Memory deleted from Pinecone: ${memoryId}`);
  } catch (error) {
    console.error('Pinecone deletion error:', error);
    // Don't throw - this shouldn't break the app if Pinecone fails
  }
}

module.exports = {
  storeMemory,
  retrieveMemories,
  deleteMemory,
  isPineconeConfigured: () => !!pc
};