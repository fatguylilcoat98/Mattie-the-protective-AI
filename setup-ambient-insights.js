/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// AMBIENT INSIGHTS TABLE SETUP
// Creates missing ambient_insights table for ambient awareness system

const { supabase } = require('./lib/supabase');

async function setupAmbientInsightsTable() {
  try {
    console.log('[AMBIENT SETUP] Creating ambient insights table...');

    // Create ambient_insights table
    const ambientInsightsSQL = `
      CREATE TABLE IF NOT EXISTS ambient_insights (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          insight_type VARCHAR(100) NOT NULL,
          insight_content TEXT NOT NULL,
          context_data JSONB DEFAULT '{}',
          confidence_score DECIMAL(3,2) DEFAULT 0.5 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
          priority_level VARCHAR(20) DEFAULT 'medium',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          processed_at TIMESTAMP WITH TIME ZONE,
          is_delivered BOOLEAN DEFAULT FALSE,
          delivery_method VARCHAR(50),
          metadata JSONB DEFAULT '{}'
      );
    `;

    const { error: tableError } = await supabase.rpc('exec_sql', { sql: ambientInsightsSQL });
    if (tableError && !tableError.message.includes('already exists')) {
      throw tableError;
    }

    // Create recent_internal_thoughts table (alternative table name)
    const thoughtsTableSQL = `
      CREATE TABLE IF NOT EXISTS recent_internal_thoughts (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          thought_content TEXT NOT NULL,
          thought_type VARCHAR(100) DEFAULT 'ambient',
          context_data JSONB DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          is_processed BOOLEAN DEFAULT FALSE,
          metadata JSONB DEFAULT '{}'
      );
    `;

    const { error: thoughtsError } = await supabase.rpc('exec_sql', { sql: thoughtsTableSQL });
    if (thoughtsError && !thoughtsError.message.includes('already exists')) {
      throw thoughtsError;
    }

    // Create indexes
    const indexSQL = `
      CREATE INDEX IF NOT EXISTS idx_ambient_insights_user_id ON ambient_insights(user_id);
      CREATE INDEX IF NOT EXISTS idx_ambient_insights_created_at ON ambient_insights(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_ambient_insights_insight_type ON ambient_insights(insight_type);
      CREATE INDEX IF NOT EXISTS idx_recent_internal_thoughts_user_id ON recent_internal_thoughts(user_id);
      CREATE INDEX IF NOT EXISTS idx_recent_internal_thoughts_created_at ON recent_internal_thoughts(created_at DESC);
    `;

    const { error: indexError } = await supabase.rpc('exec_sql', { sql: indexSQL });
    if (indexError && !indexError.message.includes('already exists')) {
      console.warn('[AMBIENT SETUP] Index creation warning:', indexError.message);
    }

    // Test table access
    const { data: testData, error: testError } = await supabase
      .from('ambient_insights')
      .select('count')
      .limit(1);

    if (testError) {
      console.warn('[AMBIENT SETUP] Table test warning:', testError.message);
    }

    console.log('[AMBIENT SETUP] ✅ Ambient insights tables created successfully!');
    console.log('[AMBIENT SETUP] Tables available:');
    console.log('  🧠 ambient_insights - Main insights storage');
    console.log('  💭 recent_internal_thoughts - Alternative thoughts storage');
    console.log('  🔍 Indexes created for optimal performance');

    return true;

  } catch (error) {
    console.error('[AMBIENT SETUP] Setup failed:', error);
    throw error;
  }
}

// Run setup if called directly
if (require.main === module) {
  setupAmbientInsightsTable()
    .then(() => {
      console.log('[AMBIENT SETUP] Setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[AMBIENT SETUP] Setup failed:', error);
      process.exit(1);
    });
}

module.exports = {
  setupAmbientInsightsTable
};