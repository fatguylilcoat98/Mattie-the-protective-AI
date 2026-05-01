/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// RECENT INTERNAL THOUGHTS TABLE MIGRATION
// Fixes missing columns for ambient awareness system

const { supabase } = require('./lib/supabase');
const fs = require('fs');
const path = require('path');

async function setupRecentInternalThoughts() {
  try {
    console.log('[MIGRATION] Fixing recent_internal_thoughts table schema...');

    // Read the migration SQL file
    const sqlPath = path.join(__dirname, 'sql', 'fix-recent-internal-thoughts.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    console.log('[MIGRATION] Executing migration...');

    // Execute the full migration
    const { error } = await supabase.rpc('exec_sql', { sql: sqlContent });

    if (error) {
      console.error('[MIGRATION] Migration failed:', error);
      throw error;
    }

    // Test the required columns exist
    console.log('[MIGRATION] Testing table structure...');

    const { error: testError } = await supabase
      .from('recent_internal_thoughts')
      .insert({
        user_id: 'test-migration',
        thought_content: 'Test migration record',
        thought_type: 'test'
      });

    if (testError) {
      console.error('[MIGRATION] Table test failed:', testError);

      // Try to clean up test record if it was partially inserted
      await supabase
        .from('recent_internal_thoughts')
        .delete()
        .eq('user_id', 'test-migration')
        .eq('thought_type', 'test');

      throw testError;
    }

    // Clean up test record
    const { error: cleanupError } = await supabase
      .from('recent_internal_thoughts')
      .delete()
      .eq('user_id', 'test-migration')
      .eq('thought_type', 'test');

    if (cleanupError) {
      console.warn('[MIGRATION] Test record cleanup warning:', cleanupError.message);
    }

    console.log('[MIGRATION] ✅ Migration completed successfully!');
    console.log('[MIGRATION] recent_internal_thoughts table now has:');
    console.log('  📝 user_id VARCHAR(255)');
    console.log('  💭 thought_content TEXT');
    console.log('  🏷️ thought_type VARCHAR(100)');
    console.log('  📅 created_at TIMESTAMP');
    console.log('  🔄 updated_at TIMESTAMP');
    console.log('  ✅ is_processed BOOLEAN');
    console.log('  📊 metadata JSONB');
    console.log('  🔍 Performance indexes created');

    return true;

  } catch (error) {
    console.error('[MIGRATION] Setup failed:', error);
    throw error;
  }
}

// Run migration if called directly
if (require.main === module) {
  setupRecentInternalThoughts()
    .then(() => {
      console.log('[MIGRATION] Migration completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[MIGRATION] Migration failed:', error);
      process.exit(1);
    });
}

module.exports = {
  setupRecentInternalThoughts
};