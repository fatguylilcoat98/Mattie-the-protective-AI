/*
  Mattie — unified companion chat.
  One Mattie, one memory: typed chat uses the same MATTIE_SOUL persona
  and the same `memories` store that voice (converse) and the proactive
  openers use, so spoken and typed conversations are continuous.
  Scam protection runs here too.
*/

const express = require('express');
const router = express.Router();
const { requireAuth, requireOwner } = require('../middleware/auth');
const { storeMemory, getMemoriesForUser } = require('../lib/supabase');
const { generateMattieResponse } = require('../lib/anthropic');
const { ConfidenceInterventionEngine, INTERVENTION_MODES } = require('../lib/confidence-intervention');

function persist(userId, userText, mattieText, reason) {
  storeMemory(userId, `User: ${userText}`, 'shared_history', 'user.general',
    { source_type: 'user_direct_statement', creation_reason: 'companion_user' }).catch(() => {});
  storeMemory(userId, `Mattie: ${mattieText}`, 'shared_history', 'user.general',
    { source_type: 'conversation', creation_reason: reason }).catch(() => {});
}

router.post('/chat', requireAuth, requireOwner, async (req, res) => {
  try {
    const { message, imageData } = req.body;
    const userId = req.userId;

    if (!message && !imageData) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Confidence-routed intervention system
    if (message) {
      const interventionEngine = new ConfidenceInterventionEngine();
      const assessment = interventionEngine.assessRisk(message, {
        has_documentation: false,
        has_witness: false
      });

      // Only intervene for protection, verify, and escalation modes
      if (assessment.mode !== INTERVENTION_MODES.NORMAL) {
        const response = assessment.response.message;

        // Log the sophisticated assessment for review
        console.log(`[INTERVENTION] Mode: ${assessment.mode}, Risk: ${assessment.combined_risk.toFixed(2)}, Reason: ${assessment.reasoning}`);
        console.log(`[INTERVENTION] Scores:`, assessment.confidence_scores);

        persist(userId, message, response, `companion_${assessment.mode}`);
        return res.json({
          response,
          intervention_mode: assessment.mode,
          confidence_assessment: assessment.confidence_scores
        });
      }
    }

    // Shared long-term memory — the SAME store voice + proactive use.
    let memories = [];
    try { memories = (await getMemoriesForUser(userId, 40)) || []; } catch (_) {}

    let reply;
    try {
      reply = await generateMattieResponse(
        message || 'Please look at this picture and tell me about it.',
        memories,
        false,
        null,
        { imageData: imageData || null }
      );
    } catch (_) {
      return res.json({
        response: "I'm having a little trouble thinking right now, Sandy. Let's try again in a moment."
      });
    }

    persist(userId, message || '[sent a picture]', reply, 'companion_assistant');
    return res.json({ response: reply });

  } catch (error) {
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
});

module.exports = router;
