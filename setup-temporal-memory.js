/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// TEMPORAL MEMORY SYSTEM SETUP
// Creates database schema for honest, time-aware memory

const { supabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

async function setupTemporalMemorySystem() {
  try {
    console.log('[TEMPORAL SETUP] Creating temporal memory system...');

    // Read the SQL schema file
    const sqlPath = path.join(__dirname, 'sql', 'temporal-memory-schema.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Split into individual statements (simple approach)
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`[TEMPORAL SETUP] Executing ${statements.length} SQL statements...`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        try {
          console.log(`[TEMPORAL SETUP] Executing statement ${i + 1}/${statements.length}`);
          const { error } = await supabase.rpc('exec_sql', { sql: statement });

          if (error && !error.message.includes('already exists')) {
            console.error(`[TEMPORAL SETUP] Error in statement ${i + 1}:`, error);
            throw error;
          }
        } catch (statementError) {
          if (!statementError.message.includes('already exists')) {
            console.error(`[TEMPORAL SETUP] Failed to execute statement ${i + 1}:`, statement.substring(0, 100) + '...');
            throw statementError;
          }
        }
      }
    }

    // Test the table creation
    const { data: testData, error: testError } = await supabase
      .from('temporal_memories')
      .select('count(*)')
      .limit(1);

    if (testError) {
      console.error('[TEMPORAL SETUP] Table verification failed:', testError);
      throw testError;
    }

    console.log('[TEMPORAL SETUP] ✅ Temporal memory system created successfully!');
    console.log('[TEMPORAL SETUP] Features enabled:');
    console.log('  📅 Conversation date vs creation date tracking');
    console.log('  🎯 Confidence level degradation over time');
    console.log('  📈 Memory evolution and supersession tracking');
    console.log('  🔍 Access count and precision calculation');
    console.log('  🌍 Reality context integration');
    console.log('  🔗 Memory chain evolution tracking');

    return true;

  } catch (error) {
    console.error('[TEMPORAL SETUP] Setup failed:', error);
    throw error;
  }
}

// Alternative setup using direct SQL execution
async function setupTemporalMemoryDirect() {
  try {
    console.log('[TEMPORAL SETUP] Creating temporal memory table directly...');

    // Create the main table
    const { error: tableError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS temporal_memories (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id UUID NOT NULL,
          content TEXT NOT NULL,
          memory_type VARCHAR(50) DEFAULT 'conversation',
          conversation_date TIMESTAMP WITH TIME ZONE NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          last_accessed TIMESTAMP WITH TIME ZONE,
          context_type VARCHAR(20) DEFAULT 'real-time',
          confidence_level DECIMAL(3,2) DEFAULT 1.0,
          evolution_stage VARCHAR(20) DEFAULT 'initial',
          access_count INTEGER DEFAULT 0,
          source_conversation_id UUID,
          reality_context JSONB,
          superseded_by UUID,
          thinking_pattern_shift BOOLEAN DEFAULT false,
          created_by_system VARCHAR(50) DEFAULT 'splendor',
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
      `
    });

    if (tableError && !tableError.message.includes('already exists')) {
      throw tableError;
    }

    console.log('[TEMPORAL SETUP] ✅ Temporal memory table created!');
    return true;

  } catch (error) {
    console.error('[TEMPORAL SETUP] Direct setup failed:', error);
    return false;
  }
}

// Run setup if called directly
if (require.main === module) {
  setupTemporalMemorySystem()
    .then(() => {
      console.log('[TEMPORAL SETUP] Setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[TEMPORAL SETUP] Setup failed:', error);
      process.exit(1);
    });
}

module.exports = {
  setupTemporalMemorySystem,
  setupTemporalMemoryDirect
};