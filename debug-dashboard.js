// Quick debug script to test dashboard APIs
const testUserId = 'test-user';

console.log('Testing dashboard APIs...');

// Test cognitive profile API
fetch(`/cognitive/api/${testUserId}/profile`)
  .then(response => response.json())
  .then(data => {
    console.log('Cognitive Profile API response:', data);
  })
  .catch(error => {
    console.error('Cognitive Profile API error:', error);
  });

// Test sci-fi status API
fetch(`/api/scifi/status/${testUserId}`)
  .then(response => response.json())
  .then(data => {
    console.log('Sci-Fi Status API response:', data);
  })
  .catch(error => {
    console.error('Sci-Fi Status API error:', error);
  });