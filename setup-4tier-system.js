/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  4-Tier Memory System Setup Script

  Runs database migrations and seeds foundational rules.
  Run this on Render after deployment to initialize the new architecture.

  Built by Christopher Hughes with Claude Code
  Truth · Safety · We Got Your Back
*/

require('dotenv').config();

async function setup4TierSystem() {
  console.log('=== SPLENDOR 4-TIER MEMORY SYSTEM SETUP ===\n');

  try {
    // Check required environment variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      console.log('❌ Supabase environment variables missing');
      console.log('   This script must run on Render where database is configured');
      return;
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('⚠️ Anthropic API key missing - consciousness features will be limited');
    }

    if (!process.env.OPENAI_API_KEY) {
      console.log('⚠️ OpenAI API key missing - background jobs and visual expression disabled');
    }

    console.log('📡 Environment variables verified\n');

    // Import modules after env check
    const { supabase } = require('./lib/supabase');
    const { seedFoundationalRules } = require('./lib/memory/foundational-rules');
    const { storeFoundationalRule, isPineconeConfigured } = require('./lib/pinecone');
    const fs = require('fs');

    // STEP 1: Run database migrations
    console.log('🗄️  STEP 1: Database Migration');
    try {
      const migrationSQL = fs.readFileSync('./database/governance-foundation.sql', 'utf8');

      // Execute migration in chunks to avoid timeout
      const statements = migrationSQL
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => stmt && !stmt.startsWith('--') && !stmt.startsWith('/*'));

      console.log(`   Executing ${statements.length} database statements...`);

      let successCount = 0;
      for (const statement of statements) {
        try {
          if (statement.toUpperCase().includes('CREATE TABLE') ||
              statement.toUpperCase().includes('CREATE INDEX') ||
              statement.toUpperCase().includes('INSERT INTO') ||
              statement.toUpperCase().includes('ALTER TABLE')) {

            const { error } = await supabase.rpc('exec_sql', { sql_query: statement + ';' });
            if (error && !error.message.includes('already exists')) {
              console.log(`   ⚠️ ${error.message.substring(0, 100)}`);
            } else {
              successCount++;
            }
          }
        } catch (stmtError) {
          if (!stmtError.message.includes('already exists')) {
            console.log(`   ⚠️ Statement failed: ${stmtError.message.substring(0, 100)}`);
          }
        }
      }

      console.log(`   ✅ Database migration complete (${successCount} statements executed)\n`);
    } catch (migrationError) {
      console.log(`   ❌ Database migration failed: ${migrationError.message}`);
      console.log('   Continuing with foundational rules setup...\n');
    }

    // STEP 2: Seed foundational rules
    console.log('📚 STEP 2: Foundational Rules');
    try {
      const seedResult = await seedFoundationalRules();
      console.log(`   ✅ Foundational rules: ${seedResult.added} added, ${seedResult.skipped} existing\n`);
    } catch (seedError) {
      console.log(`   ❌ Foundational rules seeding failed: ${seedError.message}\n`);
    }

    // STEP 3: Pinecone foundational rules (if available)
    if (isPineconeConfigured()) {
      console.log('📍 STEP 3: Pinecone Foundational Rules');
      try {
        const truthRule = `Christopher's highest value is truth. He considers inference presented as memory to be a form of deception. When Splendor does not have a specific source for a claim, she must say so directly. "I don't know" is always preferable to a plausible-sounding fabrication. This was established directly by Christopher on April 29, 2026.`;

        await storeFoundationalRule(
          'foundational-truth-rule-2026-04-29',
          truthRule,
          '2026-04-29'
        );
        console.log('   ✅ Truth rule stored in Pinecone\n');
      } catch (pineconeError) {
        console.log(`   ⚠️ Pinecone storage failed: ${pineconeError.message}\n`);
      }
    } else {
      console.log('📍 STEP 3: Pinecone not configured - skipping semantic storage\n');
    }

    // STEP 4: Verify system health
    console.log('🔍 STEP 4: System Verification');
    try {
      // Check that key tables exist
      const { data: tablesData, error: tablesError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .in('table_name', ['foundational_rules', 'memory_audit_log', 'promotion_queue', 'job_health_log']);

      if (tablesError) {
        throw tablesError;
      }

      const tableNames = tablesData.map(t => t.table_name);
      console.log(`   ✅ Core tables present: ${tableNames.join(', ')}`);

      // Check foundational rules count
      const { count: rulesCount } = await supabase
        .from('foundational_rules')
        .select('id', { count: 'exact' });

      console.log(`   ✅ Foundational rules loaded: ${rulesCount || 0}`);

      // Test memory assembly (basic)
      const { assembleTieredMemory } = require('./lib/memory/tier-assembler');
      const testAssembly = await assembleTieredMemory('test-user', 'system check');

      console.log(`   ✅ Memory assembly working: ${JSON.stringify(testAssembly.totalMemories)}`);

      console.log('\n🎉 SYSTEM SETUP COMPLETE!');
      console.log('\n📋 Next Steps:');
      console.log('   1. Test the /debug/memory-load endpoint');
      console.log('   2. Verify chat uses new 4-tier system');
      console.log('   3. Background jobs will start automatically');
      console.log('   4. Monitor job health logs');

    } catch (verificationError) {
      console.log(`   ⚠️ System verification had issues: ${verificationError.message}`);
      console.log('   System may still be functional - check /debug/memory-load endpoint');
    }

  } catch (error) {
    console.error('\n💥 SETUP FAILED:', error);
    console.error('   Check environment variables and database connectivity');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  setup4TierSystem().then(() => {
    console.log('\n✨ Setup script complete!');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Setup script failed:', error);
    process.exit(1);
  });
}

module.exports = { setup4TierSystem };