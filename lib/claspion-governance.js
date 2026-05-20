/*
  Mattie — Your AI Companion · The Good Neighbor Guard
  CLASPION Governance Client — bolt-on middleware for thought→action

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

/*
  This module is the *only* seam between Mattie and CLASPION.

  Design rules (do not break these):
    1. Mattie's reasoning, memory, and personality NEVER pass through
       this module — only the action she is about to take. Thought stays
       inside Mattie; the action gets validated.
    2. A single env flag (CLASPION_ENABLED) switches the whole layer off.
       When off, the client returns an immediate dormant ALLOW verdict
       and never touches the network. Mattie runs clean.
    3. Every call is logged locally in addition to being logged
       server-side. If Mattie logs are the only ones available, an
       operator can still reconstruct what happened.
    4. Network failures are routed through CLASPION_FAIL_MODE. Default
       is fail-closed (block on network failure) because that is the
       safe default for a governance layer.
    5. The conscience is swapped on the CLASPION side. This client never
       embeds policy of its own.
*/

const crypto = require('crypto');
const { activityBus } = require('./activity-bus');

const DEFAULT_TIMEOUT_MS = 1500;
const DEFAULT_FAIL_MODE = 'block';   // 'block' | 'allow'

function readBool(envValue, fallback = false) {
  if (envValue === undefined || envValue === null) return fallback;
  const v = String(envValue).trim().toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'on';
}

function nowIso() {
  return new Date().toISOString();
}

class ClaspionGovernance {
  constructor(opts = {}) {
    // Boot-time defaults from env. These never change.
    this._envUrl = (opts.url || process.env.CLASPION_URL || '').replace(/\/+$/, '');

    // If CLASPION_URL is set, default CLASPION_ENABLED to true. Setting
    // a URL without enabling is the most common config mistake — and
    // there is nothing to do with a URL except call it. The operator
    // can still explicitly disable by setting CLASPION_ENABLED=false.
    const enabledDefault = !!this._envUrl;
    this._envEnabled = opts.enabled !== undefined
      ? !!opts.enabled
      : readBool(process.env.CLASPION_ENABLED, enabledDefault);

    // Runtime overrides — what the UI / admin endpoint set. null = use env.
    this._runtimeEnabled = null;
    this._runtimeUrl = null;

    // Last-call telemetry — surfaces in /api/governance/state so the
    // toggle UI can show "CLASPION rejecting calls: 401" the moment it
    // happens, instead of leaving the user to guess.
    this._lastCall = null; // { at, ok, status, error_code, error_message, latency_ms, decision }

    this.apiKey = opts.apiKey || process.env.CLASPION_API_KEY || '';
    this.timeoutMs = Number(opts.timeoutMs || process.env.CLASPION_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
    this.failMode = (opts.failMode || process.env.CLASPION_FAIL_MODE || DEFAULT_FAIL_MODE).toLowerCase();
    this.actorId = opts.actorId || process.env.CLASPION_ACTOR_ID || 'mattie';
    this.surface = opts.surface || 'mattie';
    this.logger = opts.logger || console;
  }

  // ── Toggle state ───────────────────────────────────────────────────

  // Effective values (runtime override beats env).
  get enabled() {
    return this._runtimeEnabled !== null ? this._runtimeEnabled : this._envEnabled;
  }
  set enabled(v) { this._runtimeEnabled = !!v; }

  get url() {
    return this._runtimeUrl !== null ? this._runtimeUrl : this._envUrl;
  }
  set url(v) { this._runtimeUrl = (v || '').replace(/\/+$/, ''); }

  isEnabled() {
    return this.enabled && !!this.url;
  }

  /** Toggle in-process. Returns the new effective state. */
  setEnabled(v) {
    this._runtimeEnabled = !!v;
    return this.getState();
  }

  /** Set the upstream URL in-process. Pass null to revert to env. */
  setUrl(v) {
    this._runtimeUrl = v == null ? null : String(v).replace(/\/+$/, '');
    return this.getState();
  }

  /** Drop runtime overrides; fall back to env defaults. */
  resetOverrides() {
    this._runtimeEnabled = null;
    this._runtimeUrl = null;
    return this.getState();
  }

  /** Snapshot for the admin/UI surface. */
  getState() {
    return {
      enabled: this.isEnabled(),
      enabled_flag: this.enabled,
      has_url: !!this.url,
      url: this.url || null,
      has_api_key: !!this.apiKey,
      fail_mode: this.failMode,
      timeout_ms: this.timeoutMs,
      actor_id: this.actorId,
      env_defaults: {
        enabled: this._envEnabled,
        url: this._envUrl || null,
      },
      runtime_overrides: {
        enabled: this._runtimeEnabled,
        url: this._runtimeUrl,
      },
      last_call: this._lastCall,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Validate a thought→action transition.
   *
   * @param {Object} args
   * @param {Object} args.thought  Mattie's reasoning context (what she
   *                               considered before committing to act).
   *                               Kept on the host wherever possible; only
   *                               summary-level data should be sent.
   * @param {Object} args.intent   The action she intends to take. Required.
   * @param {string} [args.actorId='mattie']
   * @param {string} [args.correlationId]
   * @returns {Promise<Verdict>}
   */
  async validate({ thought = {}, intent = {}, actorId, correlationId } = {}) {
    const correlation = correlationId || crypto.randomUUID();
    const intentType = intent && intent.type ? String(intent.type) : 'unspecified';
    const actor = actorId || this.actorId;
    const t0 = Date.now();

    if (!this.isEnabled()) {
      const verdict = {
        decision: 'ALLOW',
        allow: true,
        dormant: true,
        reason: 'governance disabled (CLASPION_ENABLED=false or no CLASPION_URL)',
        basis_state: 'ESTABLISHED',
        conscience_name: 'mattie-bypass',
        failed_axes: [],
        verdict_id: `local-${correlation}`,
        correlation_id: correlation,
        latency_ms: 0,
      };
      this._log('dormant', verdict, { intentType, actor });
      return verdict;
    }

    let verdict;
    let upstreamErr = null;
    try {
      verdict = await this._postValidate({ thought, intent, actor, correlation });
    } catch (err) {
      upstreamErr = err;
      verdict = this._failureVerdict(err, correlation);
    }
    verdict.correlation_id = correlation;
    verdict.latency_ms = Date.now() - t0;
    this._lastCall = {
      at: new Date().toISOString(),
      ok: !upstreamErr,
      status: upstreamErr && upstreamErr.code && /^HTTP_(\d+)$/.test(upstreamErr.code)
        ? Number(upstreamErr.code.slice(5))
        : null,
      error_code: upstreamErr ? (upstreamErr.code || 'ERROR') : null,
      error_message: upstreamErr ? String(upstreamErr.message || upstreamErr) : null,
      latency_ms: verdict.latency_ms,
      decision: verdict.decision,
      allow: !!verdict.allow,
    };
    this._log('validated', verdict, { intentType, actor });
    return verdict;
  }

  /**
   * Convenience: resolve a verdict to (allow, reason). Hosts that want
   * a one-liner instead of pattern-matching on `decision` can use this.
   */
  async check(args) {
    const verdict = await this.validate(args);
    return {
      allow: !!verdict.allow,
      reason: verdict.reason,
      decision: verdict.decision,
      verdict_id: verdict.verdict_id,
      correlation_id: verdict.correlation_id,
      basis_state: verdict.basis_state,
    };
  }

  // ── Internals ──────────────────────────────────────────────────────

  async _postValidate({ thought, intent, actor, correlation }) {
    const endpoint = `${this.url}/api/v1/governance/validate`;
    const body = JSON.stringify({
      thought,
      intent,
      actor_id: actor,
      correlation_id: correlation,
      surface: this.surface,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`CLASPION ${res.status}: ${text || res.statusText}`);
      err.code = `HTTP_${res.status}`;
      throw err;
    }
    const data = await res.json();
    return {
      decision: data.decision,
      allow: !!data.allow,
      reason: data.reason || '',
      basis_state: data.basis_state || 'UNKNOWN',
      conscience_name: data.conscience_name || 'unknown',
      failed_axes: Array.isArray(data.failed_axes) ? data.failed_axes : [],
      verdict_id: data.verdict_id || null,
      metadata: data.metadata || {},
      suggested_action: data.suggested_action || null,
    };
  }

  _failureVerdict(err, correlation) {
    const failClosed = this.failMode !== 'allow';
    const decision = failClosed ? 'BLOCK' : 'ALLOW';
    const reason = failClosed
      ? `network failure; fail-closed per CLASPION_FAIL_MODE: ${err && err.message ? err.message : 'unknown error'}`
      : `network failure; fail-open per CLASPION_FAIL_MODE: ${err && err.message ? err.message : 'unknown error'}`;
    return {
      decision,
      allow: !failClosed,
      reason,
      basis_state: 'UNREACHABLE',
      conscience_name: 'mattie-failure-handler',
      failed_axes: ['transport'],
      verdict_id: `local-fail-${correlation}`,
      metadata: { error_code: err && err.code ? err.code : 'NETWORK' },
      suggested_action: failClosed
        ? 'restore CLASPION reachability or set CLASPION_FAIL_MODE=allow for testing only'
        : null,
    };
  }

  _log(stage, verdict, ctx) {
    const line = {
      ts: nowIso(),
      tag: '[CLASPION]',
      stage,
      enabled: this.isEnabled(),
      decision: verdict.decision,
      allow: verdict.allow,
      conscience: verdict.conscience_name,
      basis: verdict.basis_state,
      intent_type: ctx.intentType,
      actor: ctx.actor,
      correlation: verdict.correlation_id,
      latency_ms: verdict.latency_ms,
      reason: verdict.reason,
    };
    // One-line summary so it greps cleanly in production logs.
    const log = this.logger && (this.logger.info || this.logger.log);
    if (log) {
      log.call(this.logger,
        `${line.tag} ${line.stage} decision=${line.decision} basis=${line.basis} conscience=${line.conscience} intent=${line.intent_type} actor=${line.actor} corr=${line.correlation} reason="${line.reason}"`);
    }
    // Surface this stage to the live activity bus so the orb rings and
    // CLASPION header ticker can react in real time. Abstract fields only.
    try {
      activityBus.emit('claspion', {
        stage: line.stage,
        decision: line.decision,
        basis: line.basis,
        conscience: line.conscience,
        intent: line.intent_type,
        latency_ms: line.latency_ms,
        dormant: !!verdict.dormant,
      });
    } catch (_) { /* never let telemetry break governance */ }
  }
}

// Module-level singleton — easy to import everywhere without re-wiring.
const governance = new ClaspionGovernance();

module.exports = {
  ClaspionGovernance,
  governance,
};
