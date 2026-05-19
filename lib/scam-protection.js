/*
  Mattie — Protective AI Companion for Sandy
  Scam Protection System
  Built by Christopher Hughes · The Good Neighbor Guard
  Truth · Safety · We Got Your Back
*/

// Common scam patterns that target elderly people
const SCAM_PATTERNS = {
  // Urgency indicators
  urgency: [
    'urgent',
    'immediate',
    'expires today',
    'act now',
    'limited time',
    'must respond within',
    'deadline',
    'time sensitive',
    'before it\'s too late',
    'last chance'
  ],

  // Payment requests
  payment: [
    'send money',
    'wire transfer',
    'gift card',
    'bitcoin',
    'cryptocurrency',
    'western union',
    'moneygram',
    'cashapp',
    'venmo',
    'zelle',
    'paypal friends',
    'prepaid card',
    'itunes card'
  ],

  // Fear tactics
  fear: [
    'account suspended',
    'will be closed',
    'legal action',
    'arrest warrant',
    'irs',
    'tax problem',
    'medicare suspended',
    'social security suspended',
    'identity stolen',
    'compromised',
    'fraudulent activity'
  ],

  // Prize/lottery scams
  prizes: [
    'you\'ve won',
    'congratulations',
    'lottery winner',
    'prize',
    'sweepstakes',
    'claim your',
    'tax fee',
    'processing fee',
    'to claim',
    'winner selected'
  ],

  // Tech support scams
  tech: [
    'tech support',
    'microsoft calling',
    'computer infected',
    'virus detected',
    'windows support',
    'apple support',
    'refund department',
    'subscription canceled'
  ],

  // Romance/charity scams
  emotional: [
    'need help',
    'medical emergency',
    'stranded',
    'disaster relief',
    'orphanage',
    'military overseas',
    'love you',
    'trust me',
    'god bless'
  ],

  // AI-generated fake content
  fakeContent: [
    'amazing video',
    'you won\'t believe',
    'incredible footage',
    'rare sighting',
    'never before seen',
    'viral video',
    'shocking discovery',
    'must watch',
    'unbelievable',
    'exclusive footage',
    'leaked video',
    'behind the scenes',
    'secret recording'
  ],

  // Suspicious sharing requests
  sharing: [
    'share this',
    'forward to everyone',
    'copy and paste',
    'share if you agree',
    'repost this',
    'spread the word',
    'tell everyone',
    'don\'t let them hide this',
    'they don\'t want you to see',
    'before it gets deleted'
  ],

  // Sandy's own words for "something feels wrong" — situations she
  // describes that should slow her down the same way an explicit scam
  // report does. Handled with a gentle, non-alarmist response.
  worrySignals: [
    // it feels off
    'feels funny', 'feels strange', 'feels off', 'feels weird', 'feels wrong',
    'seems off', 'seems strange', 'this is strange', 'doesn\'t feel right',
    'does not feel right', 'something feels', 'something is off',
    'feels suspicious', 'this feels',
    // bank / government agency contact
    'my bank called', 'bank called me', 'the bank called', 'called from my bank',
    'called from the bank', 'irs called', 'called from the irs', 'the irs',
    'social security called', 'called from social security',
    'social security administration', 'medicare called', 'called from medicare',
    'fbi called', 'called from the fbi', 'police called', 'called from the police',
    'sheriff called', 'government agency', 'called from the government',
    'someone called from', 'a government agency',
    // got a call saying...
    'got a call saying', 'i got a call', 'received a call', 'they called and said',
    'a call saying', 'call saying', 'they called me saying', 'got a phone call',
    // owe money
    'they said i owe', 'i owe money', 'said i owe', 'owe back taxes',
    'i owe them', 'owe money', 'owe taxes',
    // account problem
    'problem with my account', 'issue with my account', 'wrong with my account',
    'account has a problem', 'account is locked', 'account was compromised',
    'my account has', 'something wrong with my account',
    // should i respond / call back
    'should i respond', 'should i answer', 'should i call them back',
    'should i call back', 'do i respond', 'should i reply', 'should i do this',
    'what should i do', 'they want me to call', 'want me to call back',
    'call them back', 'told me to call back', 'asked me to call back',
    'they need me to call', 'have to call back',
    // urgency framed as worry
    'they said it\'s urgent', 'said it was urgent', 'said it is urgent',
    'they said its urgent', 'need me to act', 'i need to act', 'act right now',
    'act today', 'act immediately', 'do it right now', 'do it today',
    // secrecy
    'don\'t tell anyone', 'do not tell anyone', 'keep this between us',
    'keep this a secret', 'don\'t tell anybody', 'between you and me',
    'keep it quiet', 'not tell anyone', 'don\'t tell chris', 'don\'t tell aubrey',
    'keep this private',
    // payment method requests (worry framing)
    'they want gift cards', 'wants gift cards', 'asked for gift cards',
    'pay with gift cards', 'buy gift cards', 'they want a wire',
    'wants a wire transfer', 'send a wire', 'they want zelle', 'pay with zelle',
    'put money on a card',
    // grandchild / family-in-trouble
    'grandson is in trouble', 'granddaughter is in trouble', 'grandson needs',
    'granddaughter needs', 'family member is in trouble', 'grandson called',
    'in trouble and needs', 'needs bail', 'in jail', 'was arrested',
    'family emergency', 'hurt and needs money',
    // prize email
    'i won', 'i won a prize', 'won a sweepstakes', 'won the lottery',
    'email saying i won', 'saying i won', 'i have won',
    // SSN
    'social security number', 'my social security', 'need my social',
    'asked for my social', 'give them my social', 'wants my social',
    // police threat
    'police are coming', 'police are on their way', 'said the police',
    'warrant for my arrest', 'i will be arrested', 'you will be arrested',
    'arrest warrant', 'sheriff is coming'
  ]
};

// Warning levels
const WARNING_LEVELS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

// Analyze text for scam indicators
function analyzeForScams(text) {
  if (!text || typeof text !== 'string') {
    return { isScam: false, warningLevel: WARNING_LEVELS.LOW, indicators: [] };
  }

  const textLower = text.toLowerCase();
  const indicators = [];
  let totalScore = 0;

  // Check each pattern category
  Object.keys(SCAM_PATTERNS).forEach(category => {
    const categoryMatches = [];

    SCAM_PATTERNS[category].forEach(pattern => {
      if (textLower.includes(pattern)) {
        categoryMatches.push(pattern);

        // Weight different categories
        switch(category) {
          case 'payment': totalScore += 3; break;     // Payment requests are high risk
          case 'urgency': totalScore += 2; break;     // Urgency is very suspicious
          case 'fear': totalScore += 3; break;        // Fear tactics are red flags
          case 'prizes': totalScore += 2; break;      // Prize scams are common
          case 'tech': totalScore += 2; break;        // Tech support scams
          case 'emotional': totalScore += 1; break;   // Emotional manipulation
          case 'fakeContent': totalScore += 2; break; // AI-generated fake content
          case 'sharing': totalScore += 1; break;     // Suspicious sharing requests
          case 'worrySignals': totalScore += 5; break; // One of Sandy's worry phrases → HIGH on its own
        }
      }
    });

    if (categoryMatches.length > 0) {
      indicators.push({
        category: category,
        matches: categoryMatches,
        count: categoryMatches.length
      });
    }
  });

  // Determine warning level based on score
  let warningLevel = WARNING_LEVELS.LOW;
  let isScam = false;

  if (totalScore >= 8) {
    warningLevel = WARNING_LEVELS.CRITICAL;
    isScam = true;
  } else if (totalScore >= 5) {
    warningLevel = WARNING_LEVELS.HIGH;
    isScam = true;
  } else if (totalScore >= 3) {
    warningLevel = WARNING_LEVELS.MEDIUM;
    isScam = true;
  } else if (totalScore >= 1) {
    warningLevel = WARNING_LEVELS.LOW;
  }

  return {
    isScam,
    warningLevel,
    indicators,
    score: totalScore,
    analysis: generateAnalysis(indicators, warningLevel)
  };
}

// Generate human-readable analysis
function generateAnalysis(indicators, warningLevel) {
  if (indicators.length === 0) {
    return "This message looks fine to me.";
  }

  const hasHard = indicators.some(i =>
    ['payment', 'fear', 'prizes', 'tech', 'fakeContent'].includes(i.category));
  const hasWorry = indicators.some(i => i.category === 'worrySignals');
  const gentle = hasWorry && !hasHard;

  let analysis = gentle
    ? "Let's slow down and look at this together, Sandy:\n"
    : "I notice some concerning patterns in this message:\n";

  indicators.forEach(indicator => {
    switch(indicator.category) {
      case 'payment':
        analysis += "• This asks for money or payment - legitimate businesses don't request gift cards or wire transfers\n";
        break;
      case 'urgency':
        analysis += "• This creates false urgency - real important matters give you time to verify\n";
        break;
      case 'fear':
        analysis += "• This uses scare tactics - legitimate companies don't threaten you\n";
        break;
      case 'prizes':
        analysis += "• This claims you won something - you can't win contests you didn't enter\n";
        break;
      case 'tech':
        analysis += "• This claims to be tech support - real companies don't contact you this way\n";
        break;
      case 'emotional':
        analysis += "• This pulls at your heartstrings - scammers use emotions to bypass logic\n";
        break;
      case 'fakeContent':
        analysis += "• This claims amazing or unbelievable content - could be AI-generated fake videos or images\n";
        break;
      case 'sharing':
        analysis += "• This asks you to share or forward - legitimate content doesn't pressure you to spread it\n";
        break;
      case 'worrySignals':
        analysis += "• You're sensing something might be wrong, or someone is contacting you or pushing you to act - that instinct is worth listening to\n";
        break;
    }
  });

  // Worry-led situations get a calm footer instead of an alarm.
  if (gentle) {
    analysis += "\n💛 There's no rush here. This is exactly the kind of thing to slow down on — and to check with Chris or Aubrey before you do anything.";
    return analysis;
  }

  // Add protective advice based on warning level
  switch(warningLevel) {
    case WARNING_LEVELS.CRITICAL:
      analysis += "\n🚨 This is almost certainly a scam. Please delete this message and do not respond.";
      break;
    case WARNING_LEVELS.HIGH:
      analysis += "\n⚠️ This looks like a scam. Please call Aubrey or Chris before taking any action.";
      break;
    case WARNING_LEVELS.MEDIUM:
      analysis += "\n⚡ This has warning signs. Let's verify this together before responding.";
      break;
    case WARNING_LEVELS.LOW:
      analysis += "\n💛 This might be suspicious. When in doubt, ask Aubrey or Chris.";
      break;
  }

  return analysis;
}

// Sandy-specific guidance for different scam types
function getSandyGuidance(warningLevel, indicators) {
  const hasPayment = indicators.some(i => i.category === 'payment');
  const hasUrgency = indicators.some(i => i.category === 'urgency');
  const hasFear = indicators.some(i => i.category === 'fear');
  const hasFakeContent = indicators.some(i => i.category === 'fakeContent');
  const hasSharing = indicators.some(i => i.category === 'sharing');
  const hasWorry = indicators.some(i => i.category === 'worrySignals');

  // Worry-signal situations (no hard scam content): slow her down
  // gently, never alarmingly, always ending with calling Chris/Aubrey.
  if (hasWorry && !hasPayment && !hasFear) {
    return (
      "Sandy, let's take this slowly together — there's no rush at all:\n\n" +
      "1. You don't have to do anything right now. It's okay to pause.\n" +
      "2. It's okay not to respond, not to call back, and not to share any information yet.\n" +
      "3. Before you do anything, let's call Chris or Aubrey and talk it through together.\n" +
      "4. If it's truly important, it will still be there after you've checked with them.\n\n" +
      "You did exactly the right thing by telling me. That feeling you have is worth trusting."
    );
  }

  let guidance = "Sandy, here's what I want you to do:\n\n";

  if (warningLevel === WARNING_LEVELS.CRITICAL || warningLevel === WARNING_LEVELS.HIGH) {
    guidance += "1. Do NOT respond to this message\n";
    guidance += "2. Do NOT click any links or download anything\n";
    guidance += "3. Do NOT send any money or share personal information\n";
    guidance += "4. Call Aubrey or Chris right away to let them know about this\n";
    guidance += "5. Delete this message when you're done showing it to them\n\n";

    if (hasPayment) {
      guidance += "Remember: No legitimate business asks for gift cards, wire transfers, or cryptocurrency. Ever.\n";
    }
    if (hasUrgency) {
      guidance += "Remember: Real emergencies don't come through email or unexpected phone calls.\n";
    }
    if (hasFear) {
      guidance += "Remember: Government agencies don't threaten you through email or demand immediate payment.\n";
    }
    if (hasFakeContent) {
      guidance += "Remember: Amazing animal videos (like that fake owl) can now be created by AI. When videos seem too incredible, they often are.\n";
    }
    if (hasSharing) {
      guidance += "Remember: You never have to share or forward anything. Real news doesn't pressure you to 'spread the word.'\n";
    }

    guidance += "\nYou did exactly the right thing by showing this to me first. Trust your instincts - they're good.";
  } else {
    guidance += "1. Take a moment to think about whether you were expecting this message\n";
    guidance += "2. Don't rush into any response\n";
    guidance += "3. If it asks for money or personal information, call Aubrey or Chris first\n";
    guidance += "4. When in doubt, it's always okay to wait and verify\n\n";
    guidance += "Better to be cautious and safe than sorry later.";
  }

  return guidance;
}

module.exports = {
  analyzeForScams,
  getSandyGuidance,
  WARNING_LEVELS
};