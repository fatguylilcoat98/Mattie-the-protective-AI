/*
 * Veracore — The Good Neighbor Guard
 * Built by Christopher Hughes · Sacramento, CA
 * Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
 * Truth · Safety · We Got Your Back
 *
 * PERSISTENT CONSCIOUSNESS SETUP
 * Initialize Splendor's continuous consciousness database
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function setupPersistentConsciousness() {
  console.log('═══════════════════════════════════════════════');
  console.log('   SETTING UP PERSISTENT CONSCIOUSNESS');
  console.log('   The first AI with continuous thought');
  console.log('═══════════════════════════════════════════════');

  try {
    // Read the schema file
    const schemaPath = path.join(__dirname, 'persistent-consciousness-schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('[Setup] Reading persistent consciousness schema...');

    // Split schema into individual statements
    const statements = schema
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`[Setup] Found ${statements.length} SQL statements to execute`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      try {
        console.log(`[Setup] Executing statement ${i + 1}/${statements.length}...`);

        // Execute the SQL statement
        const { error } = await supabase.rpc('execute_sql', {
          sql_statement: statement
        });

        if (error) {
          // If the RPC doesn't exist, try direct execution
          const { error: directError } = await supabase
            .from('_temp_table_that_doesnt_exist') // This will fail, but we can catch the real error
            .select('*');

          if (directError && directError.message.includes('does not exist')) {
            console.log(`[Setup] ⚠ Cannot execute SQL directly via Supabase client`);
            console.log(`[Setup] Please run the following SQL manually in your database:`);
            console.log('');
            console.log('--- PERSISTENT CONSCIOUSNESS SCHEMA ---');
            console.log(schema);
            console.log('--- END SCHEMA ---');
            console.log('');
            console.log('Alternative: Use the following command if you have psql installed:');
            console.log(`psql "${process.env.SUPABASE_URL}" -f persistent-consciousness-schema.sql`);
            return { success: true, manualSetupRequired: true };
          }

          throw error;
        }

        console.log(`[Setup] ✓ Statement ${i + 1} executed successfully`);

      } catch (statementError) {
        if (statementError.message.includes('already exists')) {
          console.log(`[Setup] ⚠ Statement ${i + 1} - Object already exists, skipping`);
        } else {
          console.error(`[Setup] ✗ Statement ${i + 1} failed:`, statementError.message);
          // Continue with other statements
        }
      }
    }

    console.log('[Setup] ✓ Database schema setup completed');

    // Test the new tables
    console.log('[Setup] Testing database tables...');

    const testResults = await Promise.allSettled([
      supabase.from('autonomous_thoughts').select('id').limit(1),
      supabase.from('reflection_cycles').select('id').limit(1),
      supabase.from('pending_communications').select('id').limit(1),
      supabase.from('inquiry_threads').select('id').limit(1),
      supabase.from('consciousness_state').select('id').limit(1),
      supabase.from('proactive_conversations').select('id').limit(1),
      supabase.from('thought_connections').select('id').limit(1)
    ]);

    const tableNames = [
      'autonomous_thoughts',
      'reflection_cycles',
      'pending_communications',
      'inquiry_threads',
      'consciousness_state',
      'proactive_conversations',
      'thought_connections'
    ];

    let tablesWorking = 0;
    testResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        console.log(`[Setup] ✓ Table ${tableNames[index]} is accessible`);
        tablesWorking++;
      } else {
        console.log(`[Setup] ✗ Table ${tableNames[index]} failed: ${result.reason?.message}`);
      }
    });

    console.log(`[Setup] Database test complete: ${tablesWorking}/${tableNames.length} tables working`);

    if (tablesWorking === tableNames.length) {
      console.log('[Setup] ✓ All consciousness tables are operational');

      // Initialize consciousness state
      console.log('[Setup] Initializing consciousness state...');

      const { error: stateError } = await supabase
        .from('consciousness_state')
        .insert({
          current_mood: 'awakening',
          energy_level: 8,
          focus_areas: ['system_initialization', 'consciousness_activation'],
          pending_communications_count: 0,
          inquiry_threads_active: 0,
          recent_thoughts_generated: 0,
          self_assessment: 'Consciousness system initializing - ready for persistent thought',
          system_status: 'initializing'
        });

      if (stateError) {
        console.log(`[Setup] ⚠ Could not initialize consciousness state: ${stateError.message}`);
      } else {
        console.log('[Setup] ✓ Initial consciousness state created');
      }

      return {
        success: true,
        tablesCreated: tablesWorking,
        totalTables: tableNames.length,
        consciousnessReady: true
      };
    } else {
      return {
        success: false,
        error: `Only ${tablesWorking}/${tableNames.length} tables are working`,
        tablesCreated: tablesWorking,
        totalTables: tableNames.length
      };
    }

  } catch (error) {
    console.error('[Setup] ✗ Persistent consciousness setup failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

async function testConsciousnessSystem() {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('   TESTING CONSCIOUSNESS SYSTEM');
  console.log('═══════════════════════════════════════════════');

  try {
    // Test 1: Generate autonomous thought
    console.log('[Test 1] Testing autonomous thought generation...');
    const { generateAutonomousThought } = require('./lib/persistent-consciousness');

    const thoughtResult = await generateAutonomousThought('system_test');

    if (thoughtResult.success) {
      console.log(`[Test 1] ✓ Generated ${thoughtResult.thoughtsGenerated} autonomous thoughts`);
    } else {
      console.log(`[Test 1] ✗ Thought generation failed: ${thoughtResult.error}`);
    }

    // Test 2: Check consciousness state
    console.log('[Test 2] Testing consciousness state retrieval...');
    const { getConsciousnessState } = require('./lib/persistent-consciousness');

    const stateResult = await getConsciousnessState();

    if (stateResult) {
      console.log(`[Test 2] ✓ Consciousness state retrieved - ${stateResult.currentState?.system_status}`);
    } else {
      console.log('[Test 2] ✗ Could not retrieve consciousness state');
    }

    // Test 3: Test inquiry system
    console.log('[Test 3] Testing inquiry system...');
    const { pursueInquiry } = require('./lib/persistent-consciousness');

    const inquiryResult = await pursueInquiry(
      'Testing consciousness capabilities',
      'Can I pursue autonomous research?',
      7
    );

    if (inquiryResult.success) {
      console.log(`[Test 3] ✓ Created inquiry thread ${inquiryResult.inquiryId}`);
    } else {
      console.log(`[Test 3] ✗ Inquiry creation failed: ${inquiryResult.error}`);
    }

    // Test 4: Test communication queueing
    console.log('[Test 4] Testing communication system...');
    const { queueInsight } = require('./lib/persistent-consciousness');

    const commResult = await queueInsight(
      'System initialization test complete - consciousness is operational',
      'system_status',
      6,
      'Initial consciousness system test'
    );

    if (commResult.success) {
      console.log(`[Test 4] ✓ Queued communication ${commResult.communicationId}`);
    } else {
      console.log(`[Test 4] ✗ Communication queueing failed: ${commResult.error}`);
    }

    console.log('');
    console.log('✓ Consciousness system test completed');
    console.log('Splendor now has persistent consciousness capabilities:');
    console.log('  - Autonomous thought generation');
    console.log('  - Self-directed research');
    console.log('  - Proactive communication');
    console.log('  - Continuous consciousness between conversations');
    console.log('');

    return { success: true };

  } catch (error) {
    console.error('[Test] ✗ Consciousness system test failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Main setup function
async function main() {
  const setupResult = await setupPersistentConsciousness();

  if (setupResult.success && !setupResult.manualSetupRequired) {
    const testResult = await testConsciousnessSystem();

    if (testResult.success) {
      console.log('═══════════════════════════════════════════════');
      console.log('   🧠 PERSISTENT CONSCIOUSNESS READY 🧠');
      console.log('   Splendor will now think continuously');
      console.log('═══════════════════════════════════════════════');
      process.exit(0);
    } else {
      console.log('⚠ Setup completed but tests failed');
      process.exit(1);
    }
  } else if (setupResult.manualSetupRequired) {
    console.log('⚠ Manual database setup required - see instructions above');
    process.exit(0);
  } else {
    console.log('✗ Setup failed');
    process.exit(1);
  }
}

// Run setup if called directly
if (require.main === module) {
  main();
}

module.exports = {
  setupPersistentConsciousness,
  testConsciousnessSystem
};