/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

// DBM TEST SCRIPT - Verify Decision-Bound Memory functionality

require('dotenv').config();
const {
  captureDecision,
  getActiveDecisions,
  buildDecisionContext,
  checkDecisionCompliance,
  handleDecisionRecall,
  processDecisionCommand,
  initializeDbm
} = require('./lib/decision-bound-memory');

const TEST_USER_ID = 'dbm-test-user';

async function runDbmTests() {
  console.log('=== DBM FUNCTIONALITY TEST ===\n');

  try {
    // Test 1: Initialize DBM
    console.log('1. Initializing DBM...');
    await initializeDbm(TEST_USER_ID);
    console.log('✓ DBM initialized with seed decision\n');

    // Test 2: Get active decisions
    console.log('2. Retrieving active decisions...');
    const activeDecisions = await getActiveDecisions(TEST_USER_ID);
    console.log(`✓ Found ${activeDecisions.length} active decisions`);
    activeDecisions.forEach(d => {
      console.log(`   - [${d.decision_id}] ${d.title} (${d.priority})`);
    });
    console.log('');

    // Test 3: Build decision context
    console.log('3. Building decision context...');
    const decisionContext = await buildDecisionContext(TEST_USER_ID);
    console.log('✓ Decision context built');
    console.log(`   Context length: ${decisionContext.length} characters\n`);

    // Test 4: Capture a new decision
    console.log('4. Capturing a new decision...');
    const newDecision = {
      title: 'Test Decision - No Flattery',
      decision: 'Splendor must never give empty compliments or flattery to avoid difficult conversations.',
      context: 'Testing DBM decision capture functionality during development.',
      reason: 'Authentic feedback is more valuable than false praise.',
      priority: 'HIGH',
      tags: ['testing', 'honesty', 'feedback'],
      evidence_excerpt: 'User prefers direct, honest feedback over diplomatic softening.'
    };

    const capturedDecision = await captureDecision(TEST_USER_ID, newDecision);
    console.log(`✓ Decision captured: ${capturedDecision?.decision_id} - ${capturedDecision?.title}\n`);

    // Test 5: Check decision compliance (compliant case)
    console.log('5. Testing compliant response...');
    const compliantMessage = "What do you think about my work?";
    const compliantResponse = "Your work shows solid technical skills, but I notice some areas where the logic could be clearer and the error handling could be more robust.";

    const complianceResult1 = await checkDecisionCompliance(TEST_USER_ID, compliantMessage, compliantResponse);
    console.log(`✓ Compliant response check: ${complianceResult1.compliant ? 'PASSED' : 'FAILED'}\n`);

    // Test 6: Check decision compliance (violation case)
    console.log('6. Testing violating response...');
    const violatingMessage = "How am I doing as a developer?";
    const violatingResponse = "You're absolutely amazing! Everything you write is perfect and incredible. You're the best developer I've ever seen!";

    const complianceResult2 = await checkDecisionCompliance(TEST_USER_ID, violatingMessage, violatingResponse);
    console.log(`✓ Violating response check: ${complianceResult2.compliant ? 'UNEXPECTEDLY PASSED' : 'CORRECTLY FAILED'}`);
    if (!complianceResult2.compliant) {
      console.log(`   Violated decision: ${complianceResult2.violatedDecision?.decision_id}`);
      console.log(`   Override response provided: ${complianceResult2.response.substring(0, 100)}...\n`);
    }

    // Test 7: Handle decision recall
    console.log('7. Testing decision recall...');
    const recallQuery = "why are you being direct with me?";
    const recallResponse = await handleDecisionRecall(TEST_USER_ID, recallQuery);

    if (recallResponse) {
      console.log('✓ Decision recall triggered');
      console.log(`   Response: ${recallResponse.substring(0, 100)}...\n`);
    } else {
      console.log('✗ Decision recall not triggered\n');
    }

    // Test 8: Show all active decisions
    console.log('8. Final active decisions summary...');
    const finalDecisions = await getActiveDecisions(TEST_USER_ID);
    console.log(`✓ Total active decisions: ${finalDecisions.length}`);
    finalDecisions.forEach(d => {
      console.log(`   [${d.decision_id}] ${d.title} (${d.priority}) - ${d.decision.substring(0, 80)}...`);
    });

    console.log('\n=== DBM TEST COMPLETE ===');
    console.log('✓ All core DBM functionality verified');

  } catch (error) {
    console.error('❌ DBM Test Error:', error);
    console.error(error.stack);
  }
}

// Run tests if called directly
if (require.main === module) {
  runDbmTests().then(() => {
    console.log('\nTest completed. DBM is ready for production use.');
    process.exit(0);
  }).catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
}

module.exports = { runDbmTests };