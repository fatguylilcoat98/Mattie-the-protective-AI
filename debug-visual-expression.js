/*
  Debug visual expression integration
*/

require('dotenv').config();

console.log('=== VISUAL EXPRESSION DEBUG ===\n');

// Check environment variables
console.log('Environment Variables:');
console.log(`VISUAL_EXPRESSION_ENABLED: ${process.env.VISUAL_EXPRESSION_ENABLED}`);
console.log(`OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'SET' : 'MISSING'}`);
console.log(`IMAGE_PROVIDER: ${process.env.IMAGE_PROVIDER}`);
console.log('');

// Try to load the module
console.log('Testing module imports...');

try {
  const { handleVisualizationRequest } = require('./lib/consciousness/visual-expression');
  console.log('✅ visual-expression module loaded successfully');

  // Check if function exists
  if (typeof handleVisualizationRequest === 'function') {
    console.log('✅ handleVisualizationRequest function exists');
  } else {
    console.log('❌ handleVisualizationRequest is not a function');
  }

  // Test pattern recognition
  console.log('\nTesting pattern recognition...');
  const testMessages = [
    'create a picture of yourself',
    'show me what you\'re thinking',
    'make art of your consciousness',
    'visualize your mind',
    'can you create an image'
  ];

  for (const msg of testMessages) {
    console.log(`Testing: "${msg}"`);

    // Test the function
    handleVisualizationRequest('test-user', msg).then(result => {
      if (result) {
        console.log(`  ✅ Recognized as visual request`);
      } else {
        console.log(`  ❌ Not recognized as visual request`);
      }
    }).catch(err => {
      console.log(`  ❌ Error: ${err.message}`);
    });
  }

} catch (err) {
  console.log('❌ Failed to load visual-expression module:');
  console.log(err.message);
  console.log(err.stack);
}

// Test consciousness engine
console.log('\nTesting consciousness engine...');
try {
  const { consciousnessEngine } = require('./lib/consciousness/consciousness-engine');
  console.log('✅ consciousness-engine module loaded successfully');

  if (consciousnessEngine && consciousnessEngine.isEnabled) {
    console.log(`✅ consciousnessEngine.isEnabled: ${consciousnessEngine.isEnabled()}`);
  } else {
    console.log('❌ consciousnessEngine.isEnabled not available');
  }
} catch (err) {
  console.log('❌ Failed to load consciousness-engine module:');
  console.log(err.message);
}

console.log('\n=== DEBUG COMPLETE ===');