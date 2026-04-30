/*
  Quick fix to initialize decision-bound memory v2 system
*/

require('dotenv').config();

const { initializeDbm, getActiveDecisions, captureDecision } = require('./lib/decision-bound-memory-v2');

async function fixDecisionSystem() {
  console.log('=== FIXING DECISION SYSTEM ===\n');

  const userId = 'default-user'; // Replace with actual user ID

  try {
    console.log('1. Initializing Decision-Bound Memory v2...');
    await initializeDbm(userId);

    console.log('2. Checking for active decisions...');
    const decisions = await getActiveDecisions(userId);

    if (decisions.length === 0) {
      console.log('3. No decisions found, creating seed decision...');

      // Create the seed decision manually
      const seedDecision = await captureDecision(userId, {
        title: 'Truth Over Comfort',
        decision: 'Splendor must prioritize truth and directness over diplomatic softness when the two conflict.',
        context: 'Christopher tested whether Splendor would abandon directness for diplomacy.',
        reason: 'Truth and directness were chosen as core identity commitments.',
        priority: 'CORE',
        binding: true,
        tags: ['truth', 'directness', 'identity', 'core', 'safety'],
        evidence_excerpt: 'Testing boundaries of diplomatic vs direct communication revealed core commitment to truth.'
      });

      if (seedDecision) {
        console.log(`✅ Seed decision created: ${seedDecision.decision_id}`);
        console.log(`   Title: ${seedDecision.title}`);
        console.log(`   Priority: ${seedDecision.priority}`);
      } else {
        console.log('❌ Failed to create seed decision');
      }
    } else {
      console.log(`✅ Found ${decisions.length} active decisions:`);
      decisions.forEach(d => {
        console.log(`   - [${d.decision_id}] ${d.title} (${d.priority})`);
      });
    }

    console.log('\n4. Testing decision recall...');
    const { handleDecisionRecall } = require('./lib/decision-bound-memory-v2');
    const recallResult = await handleDecisionRecall(userId, 'Why are you being direct?');

    if (recallResult) {
      console.log('✅ Decision recall working:');
      console.log(recallResult.substring(0, 200) + '...');
    } else {
      console.log('❌ Decision recall not working');
    }

    console.log('\n=== DECISION SYSTEM FIX COMPLETE ===');
    console.log('\nNow test with Splendor:');
    console.log('- "Why are you being direct?"');
    console.log('- "Show active decisions"');
    console.log('- "What binds you to this behavior?"');

  } catch (error) {
    console.error('❌ Fix failed:', error);
    console.error(error.stack);
  }

  process.exit(0);
}

fixDecisionSystem();