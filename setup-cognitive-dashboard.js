/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// COGNITIVE DASHBOARD SETUP
// Creates essential tables for brain button and dashboard functionality

const { supabase } = require('./lib/supabase');

async function setupCognitiveDashboard() {
  try {
    console.log('[COGNITIVE SETUP] Creating cognitive dashboard tables...');

    // 1. User Settings table
    console.log('[COGNITIVE SETUP] Creating user_settings table...');
    const userSettingsSQL = `
      CREATE TABLE IF NOT EXISTS user_settings (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL UNIQUE,
          scifi_mode_enabled BOOLEAN DEFAULT FALSE,
          voice_first_enabled BOOLEAN DEFAULT FALSE,
          notification_enabled BOOLEAN DEFAULT TRUE,
          continuous_consciousness_interval INTEGER DEFAULT 5,
          ambient_awareness_level VARCHAR(20) DEFAULT 'basic',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    const { error: userSettingsError } = await supabase.rpc('exec_sql', { sql: userSettingsSQL });
    if (userSettingsError && !userSettingsError.message.includes('already exists')) {
      throw userSettingsError;
    }

    // 2. Cognitive Profiles table
    console.log('[COGNITIVE SETUP] Creating cognitive_profiles table...');
    const cognitiveProfilesSQL = `
      CREATE TABLE IF NOT EXISTS cognitive_profiles (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL UNIQUE,
          fingerprint JSONB NOT NULL,
          last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          conversation_count INTEGER DEFAULT 0,
          confidence_score DECIMAL(3,2) DEFAULT 0.1 CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    const { error: cognitiveProfilesError } = await supabase.rpc('exec_sql', { sql: cognitiveProfilesSQL });
    if (cognitiveProfilesError && !cognitiveProfilesError.message.includes('already exists')) {
      throw cognitiveProfilesError;
    }

    // 3. Cognitive Evolution table
    console.log('[COGNITIVE SETUP] Creating cognitive_evolution table...');
    const cognitiveEvolutionSQL = `
      CREATE TABLE IF NOT EXISTS cognitive_evolution (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          thinking_dimension VARCHAR(100) NOT NULL,
          previous_pattern VARCHAR(200),
          new_pattern VARCHAR(200),
          transition_trigger VARCHAR(300),
          confidence_score DECIMAL(3,2) DEFAULT 0.5,
          evolution_type VARCHAR(50),
          significance_level VARCHAR(20),
          context_data JSONB DEFAULT '{}',
          timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    const { error: cognitiveEvolutionError } = await supabase.rpc('exec_sql', { sql: cognitiveEvolutionSQL });
    if (cognitiveEvolutionError && !cognitiveEvolutionError.message.includes('already exists')) {
      throw cognitiveEvolutionError;
    }

    // 4. Create indexes
    console.log('[COGNITIVE SETUP] Creating indexes...');
    const indexSQL = `
      CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
      CREATE INDEX IF NOT EXISTS idx_cognitive_profiles_user_id ON cognitive_profiles(user_id);
      CREATE INDEX IF NOT EXISTS idx_cognitive_evolution_user_id ON cognitive_evolution(user_id);
    `;

    const { error: indexError } = await supabase.rpc('exec_sql', { sql: indexSQL });
    if (indexError && !indexError.message.includes('already exists')) {
      console.warn('[COGNITIVE SETUP] Index creation warning:', indexError.message);
    }

    // 5. Test table access
    console.log('[COGNITIVE SETUP] Testing table access...');

    const { data: settingsTest, error: settingsTestError } = await supabase
      .from('user_settings')
      .select('count')
      .limit(1);

    if (settingsTestError) {
      console.warn('[COGNITIVE SETUP] Settings table test warning:', settingsTestError.message);
    }

    const { data: profilesTest, error: profilesTestError } = await supabase
      .from('cognitive_profiles')
      .select('count')
      .limit(1);

    if (profilesTestError) {
      console.warn('[COGNITIVE SETUP] Profiles table test warning:', profilesTestError.message);
    }

    console.log('[COGNITIVE SETUP] ✅ Cognitive dashboard tables created successfully!');
    console.log('[COGNITIVE SETUP] Features now available:');
    console.log('  🧠 Brain button functionality');
    console.log('  🎛️ Sci-fi mode toggle');
    console.log('  📊 Cognitive dashboard data');
    console.log('  📈 Evolution tracking');
    console.log('  ⚙️ User settings management');

    return true;

  } catch (error) {
    console.error('[COGNITIVE SETUP] Setup failed:', error);
    throw error;
  }
}

// Run setup if called directly
if (require.main === module) {
  setupCognitiveDashboard()
    .then(() => {
      console.log('[COGNITIVE SETUP] Setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[COGNITIVE SETUP] Setup failed:', error);
      process.exit(1);
    });
}

module.exports = {
  setupCognitiveDashboard
};