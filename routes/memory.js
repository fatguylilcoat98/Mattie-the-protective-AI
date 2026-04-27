/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const express = require('express');
const router = express.Router();
const { getMemoriesForUser, storeMemory, verifyUser, supabase } = require('../lib/supabase');
const { storeMemory: storePineconeMemory, deleteMemory: deletePineconeMemory } = require('../lib/pinecone');

// GET /api/memory/check — returns all memories for current user (test endpoint)
router.get('/check', async (req, res) => {
  try {
    const { userid: userId, authtoken: authToken } = req.headers;

    if (!userId) {
      return res.status(400).json({ error: 'userId header required' });
    }

    // Convert to UUID format
    const { stringToUUID, ALLOWED_OWNERS } = require('../lib/supabase');
    const uuid = stringToUUID(userId);

    // Verify user if token provided
    if (authToken) {
      const user = await verifyUser(authToken);
      if (!user || user.id !== userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    // Privacy boundary: only return memories the caller owns or that are shared.
    const { data, error } = await supabase
      .from('memories')
      .select('*')
      .eq('user_id', uuid)
      .in('memory_owner', ALLOWED_OWNERS)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json({ count: data.length, memories: data, userId: userId, uuid: uuid });
  } catch (err) {
    console.error('Memory check error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get user's memories
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { authToken } = req.headers;

    // Verify user if token provided
    if (authToken) {
      const user = await verifyUser(authToken);
      if (!user || user.id !== userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const memories = await getMemoriesForUser(userId, 50);

    res.json({
      memories: memories.map(m => ({
        content: m.content,
        type: m.memory_type,
        date: m.created_at
      }))
    });

  } catch (error) {
    console.error('Memory fetch error:', error);
    res.status(500).json({ error: 'Unable to fetch memories' });
  }
});

// Add a manual memory
router.post('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { content, type = 'general', owner = 'self', authToken } = req.body;

    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }

    // Verify user if token provided
    if (authToken) {
      const user = await verifyUser(authToken);
      if (!user || user.id !== userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const memory = await storeMemory(userId, content, type, owner);

    // Also store in Pinecone for semantic search
    if (memory) {
      try {
        await storePineconeMemory(memory.id, content, userId, type);
      } catch (error) {
        console.error('Failed to store memory in Pinecone:', error);
        // Don't fail the request if Pinecone storage fails
      }
    }

    res.json({
      success: true,
      memory: {
        content: memory?.content,
        type: memory?.memory_type,
        owner: memory?.memory_owner,
        date: memory?.created_at
      }
    });

  } catch (error) {
    console.error('Memory storage error:', error);
    res.status(500).json({ error: 'Unable to store memory' });
  }
});

// Delete a memory
router.delete('/:userId/:memoryId', async (req, res) => {
  try {
    const { userId, memoryId } = req.params;
    const { authToken } = req.body;

    // Verify user if token provided
    if (authToken) {
      const user = await verifyUser(authToken);
      if (!user || user.id !== userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const { error } = await supabase
      .from('memories')
      .delete()
      .eq('id', memoryId)
      .eq('user_id', userId);

    if (error) throw error;

    // Also delete from Pinecone
    try {
      await deletePineconeMemory(memoryId);
    } catch (error) {
      console.error('Failed to delete memory from Pinecone:', error);
      // Don't fail the request if Pinecone deletion fails
    }

    res.json({ success: true });

  } catch (error) {
    console.error('Memory deletion error:', error);
    res.status(500).json({ error: 'Unable to delete memory' });
  }
});

module.exports = router;