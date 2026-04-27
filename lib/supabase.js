/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Convert string user ID to UUID format for database
function stringToUUID(str) {
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
const getMemoriesForUser = async (userId, limit = 10) => {
  try {
    const uuid = stringToUUID(userId);
    const { data, error } = await supabase
      .from('memories')
      .select('content, memory_type, created_at')
      .eq('user_id', uuid)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching memories:', error);
    return [];
  }
};

const storeMemory = async (userId, content, memoryType = 'general') => {
  try {
    const uuid = stringToUUID(userId);
    const { data, error } = await supabase
      .from('memories')
      .insert([{
        user_id: uuid,
        content: content.trim(),
        memory_type: memoryType
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
  stringToUUID
};