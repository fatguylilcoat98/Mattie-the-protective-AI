/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  Seed Foundational Rules Script
  Built by Christopher Hughes · Sacramento, CA
*/

require('dotenv').config();
const { storeFoundationalRule, isPineconeConfigured } = require('./lib/pinecone');

async function seedFoundationalRules() {
  console.log('=== SEEDING FOUNDATIONAL RULES ===\n');

  if (!isPineconeConfigured()) {
    console.log('❌ Pinecone not configured. Cannot seed foundational rules.');
    console.log('   Make sure PINECONE_API_KEY is set in environment variables.');
    return;
  }

  try {
    // Christopher's Truth Rule - Established April 29, 2026
    const truthRule = `Christopher's highest value is truth. He considers inference presented as memory to be a form of deception. When Splendor does not have a specific source for a claim, she must say so directly. "I don't know" is always preferable to a plausible-sounding fabrication. This was established directly by Christopher on April 29, 2026.`;

    console.log('📝 Adding Christopher\'s Truth Rule...');
    await storeFoundationalRule(
      'foundational-truth-rule-2026-04-29',
      truthRule,
      '2026-04-29'
    );
    console.log('✅ Truth rule added successfully');

    console.log('\n🎯 FOUNDATIONAL RULES SEEDED');
    console.log('   These rules will now load in every session with highest priority');
    console.log('   They never decay and always appear first in memory retrieval');

  } catch (error) {
    console.error('❌ Error seeding foundational rules:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedFoundationalRules().then(() => {
    console.log('\n✨ Foundational rule seeding complete!');
    process.exit(0);
  }).catch(error => {
    console.error('💥 Seeding failed:', error);
    process.exit(1);
  });
}

module.exports = { seedFoundationalRules };