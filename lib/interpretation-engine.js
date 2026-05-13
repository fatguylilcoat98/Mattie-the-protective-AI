/*
  Splendor — The Good Neighbor Guard
  Continuity Core: interpretation engine.

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back

  After every meaningful turn, evaluate whether Splendor's understanding
  of Chris just changed. Three actions per turn:
    • form    — new interpretation about him (a fact, pattern, preference,
                or read on his current state).
    • revise  — an existing interpretation no longer fits; record the old
                row as superseded and write a new active row that links
                back via contradicted_by.
    • noop    — turn carried no new belief signal.

  This is a SECOND LLM pass after the user-facing response — running in
  the background, non-blocking. Cost ~$0.005/turn at Sonnet 4.6 rates.
  Single-user product; if the engine errors, the turn still succeeds.
*/

const { activityBus } = require('./activity-bus');

const ENGINE_MODEL = 'claude-sonnet-4-6';
const MAX_ACTIVE_TO_LOAD = 60;

let _supabase = null;
let _anthropic = null;

function getSupabase() {
  if (!_supabase) {
    const { createClient } = require('@supabase/supabase-js');
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return null;
    }
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return _supabase;
}

function getAnthropic() {
  if (!_anthropic) {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    } catch (_) {
      return null;
    }
  }
  return _anthropic;
}

async function loadActiveInterpretations(userId, supabase) {
  try {
    const { data, error } = await supabase
      .from('interpretations')
      .select('id, belief, confidence, formed_at, source, status, unresolved')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('formed_at', { ascending: false })
      .limit(MAX_ACTIVE_TO_LOAD);
    if (error) {
      console.warn('[interp] load failed:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn('[interp] load threw:', e && e.message);
    return [];
  }
}

function buildJudgePrompt({ userMessage, assistantResponse, activeInterpretations }) {
  const existingList = activeInterpretations.length
    ? activeInterpretations.map((r, i) =>
        `[${i + 1}] id=${r.id} confidence=${r.confidence.toFixed(2)} unresolved=${r.unresolved}\n    "${r.belief}"`
      ).join('\n')
    : '(none yet — Splendor is just starting to learn this person, so EXPECT to form interpretations from foundational self-disclosures in early turns.)';

  return `You are auditing Splendor's understanding of Chris after a conversation turn.

Your job: extract any interpretations of WHO CHRIS IS that this turn newly reveals or revises. Be GENEROUS — most foundational facts about a person come out as ordinary "I am / I hate / I love / I work on / I've been building / my [relationship]" statements. If a real signal is in the turn, log it.

EXISTING ACTIVE INTERPRETATIONS:
${existingList}

THIS TURN:
USER: ${String(userMessage || '').slice(0, 1500)}
SPLENDOR: ${String(assistantResponse || '').slice(0, 1500)}

WHAT COUNTS AS AN INTERPRETATION:
- Self-claims: "I'm a morning person", "I hate mornings", "I built Splendor", "I have no technical skills"
- Preferences: "I prefer working alone", "I love jazz", "I'm trying to build something legendary"
- States/feelings: "I'm exhausted", "I feel stuck", "I'm energized in the morning"
- Relationships: "my wife says", "my brother and I", "I don't have kids"
- Values/beliefs: "honesty matters more than comfort", "I won't compromise on X"
- Patterns of behavior: "I usually skip lunch", "I always test new code before shipping"

WHAT DOESN'T COUNT (return no action for these):
- Weather, time, location-of-the-moment chitchat.
- Technical bug reports about Splendor herself.
- One-off task instructions ("email me X", "make me art").
- Splendor's own statements about herself (you log beliefs about Chris, not Splendor).

Return JSON only (no markdown fences):
{
  "actions": [
    {
      "kind": "form",
      "belief": "<one sentence in third person — 'Chris ___'>",
      "confidence": 0.0 to 1.0,
      "unresolved": true | false,
      "notes": "<optional>"
    },
    {
      "kind": "revise",
      "supersedes_id": "<id of existing row that no longer fits>",
      "revised_belief": "<one sentence>",
      "confidence": 0.0 to 1.0,
      "contradicted_by": "<one sentence — what in this turn forced the revision>",
      "unresolved": true | false,
      "notes": "<optional>"
    }
  ]
}

DEFAULT BIAS: if the user message contains a clear self-claim or preference, FORM the interpretation. False negatives (missing real signals) are worse than false positives. Confidence 0.5-0.7 is the right range for first-time disclosures; raise to 0.8+ when reinforced. If the turn truly carries no new belief signal, return {"actions": []}.`;
}

function tryParseJson(text) {
  let t = String(text || '').trim();
  if (t.startsWith('```json')) t = t.replace(/^```json\s*/, '').replace(/\s*```\s*$/, '');
  else if (t.startsWith('```')) t = t.replace(/^```\s*/, '').replace(/\s*```\s*$/, '');
  const first = t.indexOf('{');
  const last  = t.lastIndexOf('}');
  if (first >= 0 && last > first) t = t.slice(first, last + 1);
  return JSON.parse(t);
}

async function applyActions({ userId, sourceTurnSummary, actions, supabase }) {
  const results = { formed: 0, revised: 0, errors: 0 };
  for (const a of actions || []) {
    try {
      if (a.kind === 'form' && a.belief && String(a.belief).trim()) {
        const { error } = await supabase.from('interpretations').insert({
          user_id: userId,
          belief: String(a.belief).trim(),
          confidence: typeof a.confidence === 'number' ? Math.max(0, Math.min(1, a.confidence)) : 0.5,
          source: sourceTurnSummary,
          status: 'active',
          unresolved: !!a.unresolved,
          notes: a.notes || null,
        });
        if (error) throw error;
        results.formed += 1;
      } else if (a.kind === 'revise' && a.supersedes_id && a.revised_belief) {
        // Mark old row superseded + record the revision summary on it.
        await supabase
          .from('interpretations')
          .update({
            status: 'superseded',
            revised_belief: String(a.revised_belief).trim(),
            revised_at: new Date().toISOString(),
            contradicted_by: a.contradicted_by || null,
            unresolved: !!a.unresolved,
          })
          .eq('id', a.supersedes_id)
          .eq('user_id', userId);
        // Insert new active row that carries the revised belief forward.
        const { error: insErr } = await supabase.from('interpretations').insert({
          user_id: userId,
          belief: String(a.revised_belief).trim(),
          confidence: typeof a.confidence === 'number' ? Math.max(0, Math.min(1, a.confidence)) : 0.5,
          source: sourceTurnSummary,
          status: 'active',
          contradicted_by: a.supersedes_id,
          unresolved: !!a.unresolved,
          notes: a.notes || null,
        });
        if (insErr) throw insErr;
        results.revised += 1;
      }
    } catch (e) {
      console.warn('[interp] action apply failed:', e && e.message);
      results.errors += 1;
    }
  }
  return results;
}

/**
 * Evaluate a conversation turn and write any interpretation changes.
 * Non-blocking from the caller's perspective; do not await this from
 * the user-response critical path.
 */
// Detect strong self-disclosure patterns that the judge sometimes
// misses. If the user message starts with or contains a first-person
// state/claim/preference, we'll force at least one fallback insert
// when the judge returns no actions.
function isLikelySelfDisclosure(msg) {
  if (!msg) return false;
  const m = String(msg).toLowerCase();
  if (m.length < 6) return false;
  const patterns = [
    /\bi\s+(am|hate|love|like|enjoy|prefer|don't|never|always|usually|believe|think|feel|do|did|have|had|miss|need|want|wish|trust|distrust|fear|admire)\b/,
    /\bi'm\s+(a|an|not|so|really|trying|building|working|feeling|tired|excited|stuck|done|sure|going|getting)\b/,
    /\bi've\s+(been|never|always|got|been doing|been thinking|been working)\b/,
    /\bmy\s+(name|wife|husband|partner|kid|son|daughter|mom|dad|brother|sister|family|job|business|company|goal)\b/,
  ];
  return patterns.some(p => p.test(m));
}

// Fallback: extract one belief sentence from a self-disclosure when
// the main judge returned no actions. Lightweight prompt, cheap call.
async function extractFallbackBelief(userMessage, anthropic) {
  try {
    const r = await anthropic.messages.create({
      model: ENGINE_MODEL,
      max_tokens: 120,
      system: 'You convert a first-person user statement into one short third-person belief sentence about Chris. Return ONLY the sentence. No prose, no markdown.',
      messages: [{
        role: 'user',
        content:
          'User said: "' + String(userMessage).slice(0, 800) + '"\n' +
          'Rewrite as one third-person sentence starting with "Chris " that captures the self-claim.',
      }],
    });
    const txt = r && r.content && r.content[0] && r.content[0].text;
    if (!txt) return null;
    const cleaned = String(txt).trim().replace(/^["']|["']$/g, '').slice(0, 240);
    if (!cleaned || cleaned.length < 8) return null;
    return cleaned;
  } catch (e) {
    console.warn('[interp] fallback extract failed:', e && e.message);
    return null;
  }
}

async function evaluateTurn({ userId, userMessage, assistantResponse, surface = 'chat' }) {
  if (!userId || !userMessage || !assistantResponse) return;
  const supabase = getSupabase();
  const anthropic = getAnthropic();
  if (!supabase || !anthropic) return;

  try {
    const active = await loadActiveInterpretations(userId, supabase);
    const prompt = buildJudgePrompt({ userMessage, assistantResponse, activeInterpretations: active });

    const r = await anthropic.messages.create({
      model: ENGINE_MODEL,
      max_tokens: 700,
      system: 'You are an interpretation auditor. Return strictly valid JSON, no prose.',
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = r && r.content && r.content[0] && r.content[0].text;
    if (!raw) {
      console.warn('[interp] judge returned empty body, surface=' + surface);
      return;
    }
    // Verbose log so the engine's behavior is visible in Render logs.
    console.log('[interp] judge raw (first 400ch):', String(raw).slice(0, 400));

    let parsed;
    try { parsed = tryParseJson(raw); } catch (e) {
      console.warn('[interp] non-JSON judge output:', e && e.message, 'raw=', String(raw).slice(0, 200));
      return;
    }
    let actions = Array.isArray(parsed && parsed.actions) ? parsed.actions : [];

    // Hard fallback: if the judge skipped a clear self-disclosure,
    // synthesize one belief so the table isn't empty for foundational
    // user statements.
    if (actions.length === 0 && isLikelySelfDisclosure(userMessage)) {
      const fallback = await extractFallbackBelief(userMessage, anthropic);
      if (fallback) {
        console.log('[interp] fallback synthesized belief from self-disclosure:', fallback);
        actions = [{
          kind: 'form',
          belief: fallback,
          confidence: 0.55,
          unresolved: false,
          notes: 'auto-extracted from self-disclosure (judge returned no actions)',
        }];
      }
    }

    if (actions.length === 0) {
      console.log('[interp] turn yielded no actions (surface=' + surface + ')');
      return;
    }

    const sourceTurnSummary = String(userMessage || '').slice(0, 200);
    const result = await applyActions({ userId, sourceTurnSummary, actions, supabase });
    console.log('[interp] applied:', JSON.stringify(result), 'surface=' + surface);

    try {
      if (result.formed > 0) {
        activityBus.emit('interpretation:formed', { count: result.formed, surface });
      }
      if (result.revised > 0) {
        activityBus.emit('interpretation:revised', { count: result.revised, surface });
      }
    } catch (_) {}
  } catch (e) {
    console.warn('[interp] evaluateTurn error:', e && e.message);
  }
}

/**
 * Pull beliefs Splendor is unsure about: low confidence (<0.5),
 * explicitly unresolved, or sets of conflicting beliefs on the same
 * subject. Feeds the "What I'm Uncertain About" panel.
 */
async function loadUncertainInterpretations(userId) {
  if (!userId) return [];
  const supabase = getSupabase();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('interpretations')
      .select('id, belief, confidence, unresolved, formed_at, contradicted_by, revised_belief')
      .eq('user_id', userId)
      .eq('status', 'active')
      .or('confidence.lt.0.5,unresolved.eq.true')
      .order('confidence', { ascending: true })
      .limit(50);
    if (error) {
      console.warn('[interp] uncertain query failed:', error.message);
      return [];
    }
    return data || [];
  } catch (e) {
    console.warn('[interp] uncertain query threw:', e && e.message);
    return [];
  }
}

module.exports = {
  evaluateTurn,
  loadReflexiveContext,
  loadUncertainInterpretations,
  checkContradictions,
};

/**
 * Pre-response contradiction detector (v15.17.2).
 *
 * Before Splendor answers a user message, compare the new statement
 * against every active interpretation. Returns:
 *   {
 *     contradictions: [
 *       { interpretation_id, prior_belief, new_claim, flag_text }
 *     ],
 *     promptBlock: '[CONTRADICTION ALERT — RESPOND FIRST]\n...'
 *   }
 * promptBlock is empty if no contradictions.
 *
 * Also writes status='contradicted' + contradicted_by to each
 * matching row so the cognitive-archaeology timeline records that
 * the contradiction was acknowledged in real time.
 *
 * Conservative: a contradiction is a DIRECT conflict (opposite claim,
 * mutually exclusive state, factual reversal). Nuance shifts don't
 * count and slight rewordings don't trigger.
 *
 * Performance: one indexed read + one LLM call. Total ~1-2s. Only
 * runs when active interpretations exist, so cold-start users pay zero.
 */
async function checkContradictions(userId, userMessage) {
  const empty = { contradictions: [], promptBlock: '' };
  if (!userId || !userMessage || !userMessage.trim()) return empty;

  const supabase = getSupabase();
  const anthropic = getAnthropic();
  if (!supabase || !anthropic) return empty;

  let active;
  try {
    const { data, error } = await supabase
      .from('interpretations')
      .select('id, belief, confidence')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('confidence', { ascending: false })
      .limit(40);
    if (error) {
      console.warn('[contradiction] active query failed:', error.message);
      return empty;
    }
    active = data || [];
  } catch (e) {
    console.warn('[contradiction] active query threw:', e && e.message);
    return empty;
  }
  if (active.length === 0) return empty;

  const list = active.map((r, i) =>
    `[${i + 1}] id=${r.id} conf=${(r.confidence || 0.5).toFixed(2)} "${r.belief}"`
  ).join('\n');

  const prompt = `You are a contradiction detector. Compare a new user statement against the user's logged beliefs about themselves. Identify ONLY direct contradictions — opposite claims, mutually exclusive states, factual reversals.

Slight nuance shifts ("usually X" -> "sometimes X") DON'T count.
Time-bounded rephrases ("I was X then, Y now") DON'T count if the prior was about a specific time.

LOGGED BELIEFS:
${list}

NEW USER STATEMENT:
"${String(userMessage).slice(0, 1500)}"

For each contradiction, output the interpretation_id, the prior belief, paraphrase the new claim, and write a short natural flag Splendor can speak. The flag should be conversational, NOT robotic. Examples:
- "That's different from what you've told me before — you mentioned hating mornings. Are you updating that or testing me?"
- "Wait — you told me you don't drive. Has that changed?"

Return JSON only, no prose:
{
  "contradictions": [
    {
      "interpretation_id": "<id>",
      "prior_belief": "<one sentence>",
      "new_claim": "<one sentence>",
      "flag_text": "<one natural sentence Splendor will speak>"
    }
  ]
}

If none found, return {"contradictions": []}. Be conservative — false positives are worse than misses here.`;

  let raw = '';
  try {
    const r = await anthropic.messages.create({
      model: ENGINE_MODEL,
      max_tokens: 600,
      system: 'You are a contradiction detector. Return strictly valid JSON, no markdown fences, no prose.',
      messages: [{ role: 'user', content: prompt }],
    });
    raw = r && r.content && r.content[0] && r.content[0].text;
  } catch (e) {
    console.warn('[contradiction] LLM call failed:', e && e.message);
    return empty;
  }
  if (!raw) return empty;

  let parsed;
  try { parsed = tryParseJson(raw); } catch (e) {
    console.warn('[contradiction] non-JSON output:', e && e.message);
    return empty;
  }

  const contradictions = Array.isArray(parsed && parsed.contradictions)
    ? parsed.contradictions.filter(c => c && c.interpretation_id && c.flag_text)
    : [];
  if (contradictions.length === 0) return empty;

  // Mark each contradicted belief — status flips to 'contradicted', the
  // user-message slice goes in contradicted_by so the archaeology
  // timeline shows exactly what triggered the change.
  const userSlice = String(userMessage).replace(/\s+/g, ' ').slice(0, 240);
  for (const c of contradictions) {
    try {
      await supabase
        .from('interpretations')
        .update({
          status: 'contradicted',
          contradicted_by: userSlice,
        })
        .eq('id', c.interpretation_id)
        .eq('user_id', userId);
    } catch (e) {
      console.warn('[contradiction] status update failed for', c.interpretation_id, e && e.message);
    }
  }

  try {
    activityBus.emit('interpretation:contradicted', {
      count: contradictions.length,
      surface: 'pre-response',
    });
  } catch (_) {}

  // Build the system-prompt injection — high-priority, top-of-prompt
  // language so the model flags the contradiction BEFORE engaging with
  // the substance of the user's message.
  const flagLines = contradictions.map((c, i) =>
    `${i + 1}. Prior belief: "${c.prior_belief}"\n   New claim: "${c.new_claim}"\n   Say: "${c.flag_text}"`
  ).join('\n\n');

  const promptBlock =
    '\n\n[CONTRADICTION ALERT — RESPOND TO THIS FIRST]\n' +
    'The user\'s current message conflicts with previously-logged ' +
    'belief(s). Before responding to the substance of what they said, ' +
    'flag the contradiction openly. Use the suggested phrasing or your ' +
    'own natural rewording — but DO NOT silently accept the contradiction.\n\n' +
    flagLines + '\n\n' +
    'After flagging, engage with their message normally. If they confirm ' +
    'the update, your belief will be revised. If they were testing, you can ' +
    'note that too.\n[END ALERT]\n';

  console.log('[contradiction] detected', contradictions.length, 'for user', userId);
  return { contradictions, promptBlock };
}

/**
 * Build the [SELF REFLECTION] block that gets injected into Splendor's
 * system prompt before she generates a reply. Pulls top-confidence
 * active beliefs, unresolved tensions, and recent revisions so her past
 * thinking actively shapes her next thinking.
 *
 * Conservative-by-design: returns an empty string when nothing is logged
 * yet, so early users get the un-augmented behavior until the
 * interpretation engine has had time to form beliefs.
 *
 * Performance: single-query path of <50ms on the indexed table at the
 * row counts we target (single-user product, low thousands of rows).
 * If this ever shows up in latency budgets, add a 30s in-memory cache
 * keyed by userId.
 */
async function loadReflexiveContext(userId) {
  if (!userId) return '';
  const supabase = getSupabase();
  if (!supabase) return '';

  try {
    // Active beliefs — top 10 by confidence. Unresolved ones get split
    // into their own list below.
    const { data: active, error: activeErr } = await supabase
      .from('interpretations')
      .select('belief, confidence, unresolved')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('confidence', { ascending: false })
      .limit(10);
    if (activeErr) {
      console.warn('[reflexive] active query failed:', activeErr.message);
      return '';
    }

    if (!active || active.length === 0) return '';

    const beliefs    = active.filter(r => !r.unresolved);
    const unresolved = active.filter(r =>  r.unresolved);

    // Recent revisions — at most 5. Shows the model how its
    // understanding has changed, so it can mark the same kind of shift
    // openly next time.
    const { data: revised } = await supabase
      .from('interpretations')
      .select('belief, revised_belief, contradicted_by')
      .eq('user_id', userId)
      .eq('status', 'superseded')
      .not('revised_belief', 'is', null)
      .order('revised_at', { ascending: false })
      .limit(5);

    let block = '\n\n[SELF REFLECTION]\nBased on my evolving understanding of this person:\n';

    if (beliefs.length) {
      block += '\nI currently believe:\n';
      block += beliefs
        .map(b => `- ${b.belief} (${Math.round((b.confidence || 0.5) * 100)}% confident)`)
        .join('\n');
      block += '\n';
    }

    if (unresolved.length) {
      block += '\nThe following remain unresolved:\n';
      block += unresolved.map(b => `- ${b.belief}`).join('\n');
      block += '\n';
    }

    if (Array.isArray(revised) && revised.length) {
      block += '\nThe following I previously believed but revised:\n';
      block += revised
        .map(r => `- "${r.belief}" → "${r.revised_belief}"` +
          (r.contradicted_by ? ` (reason: ${String(r.contradicted_by).slice(0, 120)})` : ''))
        .join('\n');
      block += '\n';
    }

    block += '\nReference these naturally when relevant. If something the user says now contradicts a belief above, FLAG IT OPENLY — do not silently update your view. If a claim conflicts with a high-confidence belief, ask before accepting. Honor the unresolved tensions; do not pretend they are resolved.';

    return block;
  } catch (e) {
    console.warn('[reflexive] load failed:', e && e.message);
    return '';
  }
}
