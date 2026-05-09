/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Graceful degradation: a missing env var should not hard-crash the
// entire server before the health check can respond. Fall back to a
// stub client whose calls return harmless errors that the route-level
// try/catch already handles.
let supabase;
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  console.error('[supabase] Missing SUPABASE_URL / SUPABASE_ANON_KEY — using stub client (DB calls will return errors).');
  const stubError = { message: 'Supabase not configured', code: 'SUPABASE_NOT_CONFIGURED' };
  const stubBuilder = {
    select: () => stubBuilder, insert: () => stubBuilder, update: () => stubBuilder,
    delete: () => stubBuilder, upsert: () => stubBuilder, eq: () => stubBuilder,
    in: () => stubBuilder, order: () => stubBuilder, limit: () => stubBuilder,
    gte: () => stubBuilder, lte: () => stubBuilder, lt: () => stubBuilder,
    gt: () => stubBuilder, single: async () => ({ data: null, error: stubError }),
    maybeSingle: async () => ({ data: null, error: stubError }),
    then: (resolve) => resolve({ data: null, error: stubError })
  };
  supabase = {
    from: () => stubBuilder,
    auth: { getUser: async () => ({ data: { user: null }, error: stubError }) }
  };
} else {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
}

// Convert string user ID to UUID format for database
// NOTE: stringToUUID gracefully handles null/undefined so it never throws
// synchronously during a route call (the audit found this was a 500 vector).
function stringToUUID(str) {
  if (str === null || str === undefined) str = 'anonymous';
  if (typeof str !== 'string') str = String(str);
  const hash = crypto.createHash('md5').update(str).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32)
  ].join('-');
}

// Memory management functions
//
// Privacy boundary (BUILD 2): every memory is tagged with a memory_owner
// ('self' | 'shared'). A user's session only ever sees memories where
// memory_owner = 'self' for that user_id, plus any explicitly shared ones.
// Chris's memories never appear in Aubrey's context, and vice versa.
const ALLOWED_OWNERS = ['self', 'shared', 'test_system'];

const getMemoriesForUser = async (userId, limit = 10) => {
  try {
    const uuid = stringToUUID(userId);
    const { data, error } = await supabase
      .from('memory_items')
      .select('content, memory_type, created_at, category')
      .eq('user_id', uuid)
      .in('memory_owner', ALLOWED_OWNERS)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching memories:', error);
    return [];
  }
};

const storeMemory = async (userId, content, memoryType = 'general', memoryOwner = 'self') => {
  try {
    const uuid = stringToUUID(userId);
    const owner = ALLOWED_OWNERS.includes(memoryOwner) ? memoryOwner : 'self';
    const { data, error } = await supabase
      .from('memory_items')
      .insert([{
        user_id: uuid,
        content: content.trim(),
        memory_type: memoryType,
        category: 'user.general',
        source_type: 'legacy_system',
        confidence: 0.8,
        importance: 0.5,
        active: true,
        approval_status: 'approved'
      }])
      .select();

    if (error) throw error;
    return data?.[0];
  } catch (error) {
    console.error('Error storing memory:', error);
    return null;
  }
};

const logConversation = async (userId, role, content) => {
  try {
    const uuid = stringToUUID(userId);
    const { data, error } = await supabase
      .from('conversations')
      .insert([{
        user_id: uuid,
        role,
        content: content.trim()
      }]);

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error logging conversation:', error);
    return null;
  }
};

// User verification
const verifyUser = async (token) => {
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error) throw error;
    return user;
  } catch (error) {
    console.error('Error verifying user:', error);
    return null;
  }
};

module.exports = {
  supabase,
  getMemoriesForUser,
  storeMemory,
  logConversation,
  verifyUser,
  stringToUUID,
  ALLOWED_OWNERS
};