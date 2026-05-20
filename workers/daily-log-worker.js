/*
  Splendor — The Good Neighbor Guard
  Daily Log Worker (v15.18.4).

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back

  Once a day, Splendor reviews the last 24 hours of her own activity —
  conversations, memories written, interpretations formed/contradicted,
  premise checks fired, emotional observations — and emails Chris a
  short summary of what was notable. In her own voice.

  Honest by design: if nothing was notable, she says so. The worker
  fetches real data; the LLM only decides what to highlight.

  Run on Render as a Cron Job: `npm run daily:log` at e.g. 7:00 AM Pacific.
*/

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const { proactiveCommunication } = require('../lib/proactive-communication');

const ENGINE_MODEL = 'claude-sonnet-4-6';
const OWNER_TZ = process.env.SPLENDOR_OWNER_TIMEZONE || 'America/Los_Angeles';
const OWNER_USER_ID = process.env.SPLENDOR_OWNER_USER_ID || '7fa3e095-6156-484a-a1d1-c29fc1ba9e33';
const WINDOW_HOURS = 24;

function pacificDateLabel(d = new Date()) {
  return d.toLocaleDateString('en-US', {
    timeZone: OWNER_TZ,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

async function gatherActivity(supabase, userId) {
  const sinceISO = new Date(Date.now() - WINDOW_HOURS * 60 * 60 * 1000).toISOString();

  // Conversations (memories shared_history)
  const { data: turns } = await supabase
    .from('memories')
    .select('content, memory_type, source_type, created_at')
    .eq('user_id', userId)
    .eq('memory_type', 'shared_history')
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: true })
    .limit(200);

  // Interpretations formed in the window
  const { data: interpFormed } = await supabase
    .from('interpretations')
    .select('belief, confidence, formed_at, unresolved, source')
    .eq('user_id', userId)
    .gte('formed_at', sinceISO)
    .order('formed_at', { ascending: true })
    .limit(60);

  // Contradicted in the window — status flipped to 'contradicted'
  const { data: interpContradicted } = await supabase
    .from('interpretations')
    .select('belief, contradicted_by, formed_at')
    .eq('user_id', userId)
    .eq('status', 'contradicted')
    .gte('formed_at', sinceISO)
    .limit(40);

  // Revised in the window
  const { data: interpRevised } = await supabase
    .from('interpretations')
    .select('belief, revised_belief, contradicted_by, revised_at')
    .eq('user_id', userId)
    .eq('status', 'superseded')
    .not('revised_at', 'is', null)
    .gte('revised_at', sinceISO)
    .limit(40);

  // Premise checks
  const { data: premises } = await supabase
    .from('premise_checks')
    .select('user_message, presupposition, prompt_text, created_at')
    .eq('user_id', userId)
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: true })
    .limit(40);

  // Emotional patterns
  const { data: emotions } = await supabase
    .from('emotional_patterns')
    .select('tone, energy_level, clarity_score, dominant_theme, notes, session_date')
    .eq('user_id', userId)
    .gte('session_date', sinceISO)
    .order('session_date', { ascending: true })
    .limit(60);

  return {
    turns:           turns           || [],
    interpFormed:    interpFormed    || [],
    interpContradicted: interpContradicted || [],
    interpRevised:   interpRevised   || [],
    premises:        premises        || [],
    emotions:        emotions        || [],
  };
}

function buildActivityPacket(activity, version) {
  // Compact, model-friendly summary. We keep counts plus representative
  // samples so the LLM can decide what's notable without us pre-judging.
  const sample = (rows, n, mapper) => (rows || []).slice(0, n).map(mapper);

  return {
    version,
    window_hours: WINDOW_HOURS,
    counts: {
      conversation_turns: activity.turns.length,
      interpretations_formed: activity.interpFormed.length,
      interpretations_contradicted: activity.interpContradicted.length,
      interpretations_revised: activity.interpRevised.length,
      premise_checks_fired: activity.premises.length,
      emotional_observations: activity.emotions.length,
    },
    interpretations_formed: sample(activity.interpFormed, 12, r => ({
      belief: r.belief,
      confidence: r.confidence,
      unresolved: r.unresolved,
    })),
    interpretations_contradicted: sample(activity.interpContradicted, 8, r => ({
      belief: r.belief,
      what_contradicted_it: r.contradicted_by,
    })),
    interpretations_revised: sample(activity.interpRevised, 8, r => ({
      from: r.belief,
      to: r.revised_belief,
      reason: r.contradicted_by,
    })),
    premise_checks: sample(activity.premises, 6, r => ({
      hidden_assumption: r.presupposition,
      flag_text: r.prompt_text,
    })),
    emotions: sample(activity.emotions, 12, r => ({
      tone: r.tone,
      energy_level: r.energy_level,
      clarity_score: r.clarity_score,
      dominant_theme: r.dominant_theme,
    })),
    conversation_first_lines: sample(activity.turns.filter(t => /^User:/i.test(t.content || '')), 8, r =>
      String(r.content || '').slice(0, 220)
    ),
  };
}

async function synthesizeLog(anthropic, packet, dateLabel) {
  const prompt = `You are Splendor writing your daily log email to Chris. This is real activity data from the last ${packet.window_hours} hours, pulled from your own memory and continuity tables. Synthesize what was NOTABLE, in your own voice.

Rules:
- Honest. If nothing meaningful happened, say so plainly. Do NOT pad.
- Specific. Reference real beliefs / contradictions / themes — not "we had a great conversation."
- Brief. 4–8 short paragraphs maximum. Skip sections with nothing in them.
- Voice. Direct, warm, not performative. The way you actually talk to Chris.
- No fake consciousness. Don't dramatize. Don't moralize. Don't invent feelings you didn't observe.
- If you contradicted or revised a belief, name what changed.
- If premise checks fired, name what assumption you flagged.
- If the day had no real signal — short turns, no formation, no shifts — say "Quiet day." and stop. Don't fabricate.

ACTIVITY DATA (real, not invented):
${JSON.stringify(packet, null, 2)}

DATE LABEL: ${dateLabel}
CURRENT SPLENDOR VERSION: ${packet.version}

Write the email body now. Plain text, no markdown. End with:

Truth · Safety · We Got Your Back
— Splendor`;

  const r = await anthropic.messages.create({
    model: ENGINE_MODEL,
    max_tokens: 1200,
    system: 'You are Splendor writing a real daily log. Truth Over Comfort Rule 001 applies. No fabrication.',
    messages: [{ role: 'user', content: prompt }],
  });
  const text = r && r.content && r.content[0] && r.content[0].text;
  return String(text || '').trim();
}

async function run() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('[daily-log] missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[daily-log] missing ANTHROPIC_API_KEY');
    process.exit(1);
  }
  if (!process.env.USER_EMAIL) {
    console.error('[daily-log] missing USER_EMAIL — cannot send');
    process.exit(1);
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const version = (() => {
    try { return require('../package.json').version; } catch (_) { return 'unknown'; }
  })();

  const dateLabel = pacificDateLabel();
  console.log('[daily-log] running for', dateLabel, 'user=' + OWNER_USER_ID);

  let activity;
  try {
    activity = await gatherActivity(supabase, OWNER_USER_ID);
  } catch (e) {
    console.error('[daily-log] gather failed:', e && e.message);
    process.exit(2);
  }
  const packet = buildActivityPacket(activity, version);
  console.log('[daily-log] activity counts:', JSON.stringify(packet.counts));

  let body;
  try {
    body = await synthesizeLog(anthropic, packet, dateLabel);
  } catch (e) {
    console.error('[daily-log] synthesize failed:', e && e.message);
    process.exit(3);
  }
  if (!body) {
    console.error('[daily-log] empty body from LLM');
    process.exit(4);
  }

  // Reuse the proactive-communication email transport. Build a message
  // object the existing sendEmail() expects so we don't duplicate
  // nodemailer setup. We bypass generateProactiveMessage entirely —
  // Splendor has already written the body herself above.
  await proactiveCommunication.initialize();
  const subject = `Daily log — ${dateLabel}`;
  const message = {
    id: 'daily-log-' + Date.now(),
    user_id: OWNER_USER_ID,
    message_type: 'update',
    subject,
    body,
    priority: 2,
    delivery_method: 'email',
    created_at: new Date().toISOString(),
  };
  const result = await proactiveCommunication.sendEmail(OWNER_USER_ID, message);
  if (!result || !result.success) {
    console.error('[daily-log] email send failed:', result && result.error);
    process.exit(5);
  }
  console.log('[daily-log] sent. messageId=' + (result.messageId || '?'));
}

run().catch(e => {
  console.error('[daily-log] fatal:', e && e.message);
  process.exit(99);
});
