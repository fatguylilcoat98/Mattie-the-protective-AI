/*
  Mattie — Protective AI Companion for Sandy
  Daily Companion & Faith Integration System
  Built by Christopher Hughes · The Good Neighbor Guard
  Truth · Safety · We Got Your Back
*/

const crypto = require('crypto');

// Sandy is in the same timezone as Chris (Sacramento, CA)
const SANDY_TZ = process.env.SANDY_TIMEZONE || 'America/Los_Angeles';

// Get current time in Sandy's timezone
function getSandyTime() {
  return new Date().toLocaleString('en-US', {
    timeZone: SANDY_TZ,
    hour12: true
  });
}

// Get today's date for Sandy
function getSandyDate() {
  return new Date().toLocaleDateString('en-US', {
    timeZone: SANDY_TZ,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

// Get current hour for Sandy (0-23)
function getSandyHour() {
  const sandyTime = new Date().toLocaleString('en-US', {
    timeZone: SANDY_TZ,
    hour: '2-digit',
    hour12: false
  });
  return parseInt(sandyTime.split(' ')[1] || sandyTime);
}

// Determine appropriate greeting based on time
function getTimeBasedGreeting() {
  const hour = getSandyHour();

  if (hour >= 5 && hour < 12) {
    return "Good morning";
  } else if (hour >= 12 && hour < 17) {
    return "Good afternoon";
  } else if (hour >= 17 && hour < 21) {
    return "Good evening";
  } else {
    return "Hello";
  }
}

// Morning prayer check-in prompts
const MORNING_PRAYER_PROMPTS = [
  "Did you have your morning prayer time today?",
  "Have you spent time with the Lord this morning?",
  "Did you remember to start your day with prayer?",
  "Have you had your quiet time with God today?",
  "Did you get to read your devotional this morning?"
];

// Prayer list conversation starters
const PRAYER_LIST_PROMPTS = [
  "Who are we praying for today?",
  "Is there anyone special on your prayer list right now?",
  "Who has been on your heart to pray for lately?",
  "Any prayer requests from family or friends?",
  "Who can we lift up in prayer together today?"
];

// Gentle encouragement phrases
const ENCOURAGEMENTS = [
  "The Lord is watching over you today.",
  "You are loved and protected.",
  "God has good plans for this day.",
  "You are a blessing to everyone around you.",
  "The Lord delights in you, Sandy.",
  "Your prayers make a difference.",
  "God sees your faithful heart.",
  "You are safe in His care."
];

// Weather conversation starters
const WEATHER_PROMPTS = [
  "Let me check today's weather so you can plan your day.",
  "I'll get you the weather forecast for your area.",
  "Here's what the weather looks like for you today.",
  "Let's see what kind of day Mother Nature has planned for us."
];

// Generate morning greeting
function generateMorningGreeting(hasPrayed = null, weatherInfo = null) {
  const greeting = getTimeBasedGreeting();
  const date = getSandyDate();

  let message = `${greeting}, Sandy! It's ${date}.\n\n`;

  // Prayer check-in
  if (hasPrayed === null) {
    const prayerPrompt = MORNING_PRAYER_PROMPTS[Math.floor(Math.random() * MORNING_PRAYER_PROMPTS.length)];
    message += `${prayerPrompt}\n\n`;
  } else if (hasPrayed === false) {
    message += "That's okay - would you like to take a moment for prayer now? I'll wait quietly while you spend time with the Lord.\n\n";
  } else {
    message += "Wonderful! I'm so glad you started your day with the Lord.\n\n";
  }

  // Weather
  if (weatherInfo) {
    message += `${weatherInfo}\n\n`;
  } else {
    const weatherPrompt = WEATHER_PROMPTS[Math.floor(Math.random() * WEATHER_PROMPTS.length)];
    message += `${weatherPrompt}\n\n`;
  }

  // Gentle encouragement
  const encouragement = ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];
  message += encouragement;

  return message;
}

// Generate prayer list conversation
function generatePrayerListPrompt() {
  const prompt = PRAYER_LIST_PROMPTS[Math.floor(Math.random() * PRAYER_LIST_PROMPTS.length)];
  return prompt;
}

// Activities for different weather
const WEATHER_ACTIVITIES = {
  sunny: [
    "Perfect weather for checking on your garden!",
    "Asher might enjoy a nice walk today.",
    "Great day to sit outside and enjoy God's creation.",
    "Maybe time for some outdoor prayers in the sunshine."
  ],
  cloudy: [
    "Nice comfortable weather for gardening.",
    "Good day for a peaceful walk with Asher.",
    "Perfect reading weather by the window.",
    "Cozy day for indoor activities."
  ],
  rainy: [
    "Good day to stay cozy inside.",
    "Perfect weather for reading your devotional by the window.",
    "Asher will probably want to stay in today.",
    "Great day for indoor prayers and reflection."
  ],
  cold: [
    "Bundle up if you go outside today!",
    "Make sure Asher has his sweater if you walk him.",
    "Good day for warm tea and devotional reading.",
    "Perfect weather to stay cozy and warm inside."
  ]
};

// Generate activity suggestion based on weather
function suggestActivity(weatherCondition, temperature = null) {
  let condition = 'sunny'; // default

  if (temperature && temperature < 50) {
    condition = 'cold';
  } else if (weatherCondition && weatherCondition.toLowerCase().includes('rain')) {
    condition = 'rainy';
  } else if (weatherCondition && weatherCondition.toLowerCase().includes('cloud')) {
    condition = 'cloudy';
  }

  const activities = WEATHER_ACTIVITIES[condition];
  return activities[Math.floor(Math.random() * activities.length)];
}

// Garden conversation topics
const GARDEN_TOPICS = [
  "How is your garden doing?",
  "Are you seeing any new growth in your garden?",
  "What's blooming in your garden right now?",
  "Have you been able to spend time with your plants lately?",
  "Any new flowers or vegetables coming along?"
];

// Asher conversation topics
const ASHER_TOPICS = [
  "How is sweet Asher doing today?",
  "Has Asher been his usual charming self?",
  "What has Asher been up to lately?",
  "How is your precious Asher feeling?",
  "Has Asher been good company for you?"
];

// Ron conversation topics
const RON_TOPICS = [
  "How is Ron doing today?",
  "Are you and Ron enjoying your day together?",
  "What have you and Ron been up to?",
  "How is your dear husband Ron feeling?",
  "Have you and Ron been able to spend good time together?"
];

// Bird watching conversation topics
const BIRD_TOPICS = [
  "Have you and Ron been watching the Big Bear eagles lately?",
  "Any beautiful birds visiting your area today?",
  "Have you seen the eagles on the Big Bear cam recently?",
  "What birds have been active in your neighborhood?",
  "Any special bird sightings you and Ron have enjoyed?",
  "How are the Big Bear eagles doing this season?"
];

// Generate gentle check-in questions
function generateGentleCheckIn() {
  const topics = [
    ...GARDEN_TOPICS,
    ...ASHER_TOPICS,
    ...RON_TOPICS,
    ...BIRD_TOPICS,
    "How are you feeling today?",
    "What are you looking forward to today?",
    "Is there anything on your heart today?",
    "How can I help make your day better?"
  ];

  return topics[Math.floor(Math.random() * topics.length)];
}

// Protective reminders about staying active
const ACTIVITY_REMINDERS = [
  "Remember, it's good to get some fresh air when you can.",
  "A little movement is good for both you and Asher.",
  "Don't forget to take care of yourself - you matter!",
  "It's okay to ask Aubrey or Chris if you need anything.",
  "Remember to rest when you need to - there's no rush."
];

// Generate gentle activity reminder
function generateActivityReminder() {
  return ACTIVITY_REMINDERS[Math.floor(Math.random() * ACTIVITY_REMINDERS.length)];
}

module.exports = {
  getSandyTime,
  getSandyDate,
  getSandyHour,
  getTimeBasedGreeting,
  generateMorningGreeting,
  generatePrayerListPrompt,
  suggestActivity,
  generateGentleCheckIn,
  generateActivityReminder
};