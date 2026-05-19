/*
  Mattie — calm in-app proactive openers.
  When Sandy opens Mattie, she may find a short, warm message already
  waiting — a morning check-in, and at most one gentle follow-up later.
  Hard-capped at 2 per day. In-app only; no email, no scheduler.
*/

const express = require('express');
const router = express.Router();
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const { requireAuth, requireOwner } = require('../middleware/auth');
const { storeMemory, getMemoriesForUser } = require('../lib/supabase');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const FOLLOWUP_GAP_MS = 5 * 60 * 60 * 1000; // 5h between morning and follow-up
const DAILY_CAP = 2;

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function buildContext(userId) {
  try {
    const rows = await getMemoriesForUser(userId, 60);
    const lines = (rows || [])
      .filter(m => m && m.content &&
        ['shared_history', 'user_fact', 'user_preference'].includes(m.memory_type))
      .slice(0, 20)
      .map(m => '- ' + String(m.content).replace(/\s+/g, ' ').slice(0, 200))
      .reverse();
    return lines.join('\n');
  } catch (_) {
    return '';
  }
}

router.get('/pending', requireAuth, requireOwner, async (req, res) => {
  try {
    if (!anthropic) return res.json({ message: null });
    const userId = req.userId;

    const { data: today, error } = await supabase
      .from('proactive_log')
      .select('kind, created_at')
      .eq('user_id', userId)
      .gte('created_at', startOfTodayISO())
      .order('created_at', { ascending: false });

    if (error) return res.json({ message: null });

    const count = (today || []).length;
    if (count >= DAILY_CAP) return res.json({ message: null });

    let kind;
    if (count === 0) {
      kind = 'morning';
    } else {
      const last = new Date(today[0].created_at).getTime();
      if (Date.now() - last < FOLLOWUP_GAP_MS) return res.json({ message: null });
      kind = 'followup';
    }

    const context = await buildContext(userId);

    const system =
      "You are Mattie, Sandy's warm, protective AI companion. Write ONE " +
      "short message (2-4 gentle sentences) that Sandy will see waiting " +
      "for her when she opens the app. Speak directly to her, by name, " +
      "with calm kindness. If the context below mentions real details of " +
      "her life (Asher her dog, Ron, her prayer list, her garden, her " +
      "faith, something she worried about), reference ONE of them warmly " +
      "and specifically. Never alarming, never pushy, no long lists of " +
      "questions — at most one soft question. Honor her Christian faith " +
      "naturally if it fits. This is not a reply to anything she said; " +
      "it is you reaching out first because you care.\n\n" +
      (kind === 'morning'
        ? "TONE: a gentle good-morning check-in."
        : "TONE: a brief, caring follow-up later in the day.") +
      (context
        ? "\n\nWHAT YOU REMEMBER ABOUT SANDY (most recent last):\n" + context
        : "\n\n(No specific history yet — keep it warm and general.)");

    let message;
    try {
      const r = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 220,
        system,
        messages: [{ role: 'user', content: 'Write the message now. Plain text only.' }]
      });
      message = (r && r.content && r.content[0] && r.content[0].text || '').trim();
    } catch (_) {
      return res.json({ message: null });
    }
    if (!message) return res.json({ message: null });

    await supabase.from('proactive_log').insert({ user_id: userId, kind, content: message });
    storeMemory(userId, `Mattie: ${message}`, 'shared_history', 'user.general', {
      source_type: 'conversation',
      creation_reason: 'proactive_' + kind
    }).catch(() => {});

    return res.json({ message, kind });
  } catch (_) {
    return res.json({ message: null });
  }
});

module.exports = router;
