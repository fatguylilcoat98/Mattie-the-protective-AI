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
    : '(none yet)';

  return `You are auditing Splendor's understanding of Chris after a conversation turn.

Your job: decide whether this turn formed a new interpretation, revised an existing one, or carried no belief signal.

EXISTING ACTIVE INTERPRETATIONS:
${existingList}

THIS TURN:
USER: ${String(userMessage || '').slice(0, 1500)}
SPLENDOR: ${String(assistantResponse || '').slice(0, 1500)}

Rules for what counts as an interpretation:
- A read on who Chris is, what he values, what he's doing, how he's feeling, what he believes, or how he relates to Splendor.
- NOT trivia about the weather, what time it is, or technical bug reports.
- An interpretation is a CLAIM about Chris that could later be revised. "Chris is curious about consciousness" is an interpretation. "Chris asked about consciousness today" is not.

Return JSON with this shape ONLY (no markdown fences):
{
  "actions": [
    // zero or more of these objects:
    {
      "kind": "form",
      "belief": "<one sentence>",
      "confidence": 0.0 to 1.0,
      "unresolved": true | false,
      "notes": "<optional short context>"
    },
    {
      "kind": "revise",
      "supersedes_id": "<id of existing row>",
      "revised_belief": "<one sentence — the new version>",
      "confidence": 0.0 to 1.0,
      "contradicted_by": "<short reason — what in this turn forced the revision>",
      "unresolved": true | false,
      "notes": "<optional>"
    }
  ]
}

If nothing changed, return {"actions": []}.
Be conservative. Most turns produce zero actions. Form/revise only when the signal is clear.`;
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
      max_tokens: 600,
      system: 'You are an interpretation auditor. Return strictly valid JSON, no prose.',
      messages: [{ role: 'user', content: prompt }],
    });
    const raw = r && r.content && r.content[0] && r.content[0].text;
    if (!raw) return;

    let parsed;
    try { parsed = tryParseJson(raw); } catch (e) {
      console.warn('[interp] non-JSON judge output:', e && e.message);
      return;
    }
    const actions = Array.isArray(parsed && parsed.actions) ? parsed.actions : [];
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

module.exports = {
  evaluateTurn,
  loadReflexiveContext,
};

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
