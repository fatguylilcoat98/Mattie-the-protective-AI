/*
  Splendor — The Remarkable AI · The Good Neighbor Guard
  CLASPION governance admin routes — UI-facing toggle + state.

  Built by Christopher Hughes · Sacramento, CA
  Created with the help of AI collaborators (Claude · GPT · Gemini · Groq)
  Truth · Safety · We Got Your Back
*/

const express = require('express');
const router = express.Router();
const { governance } = require('../lib/claspion-governance');
const { enhancedGovernance } = require('../lib/claspion-enhanced-integration');
const { GOOD_NEIGHBOR_GUARD_RULES } = require('../lib/good-neighbor-guard-rules');

// Read current state.
router.get('/state', (req, res) => {
  res.json(governance.getState());
});

// Back-compat alias for the previous /api/governance/status endpoint.
router.get('/status', (req, res) => {
  res.json(governance.getState());
});

// Set state. Accepts { enabled?: bool, url?: string|null }.
// Passing url=null reverts that override to the env default; same for
// omitting fields — only the fields you provide are changed.
router.post('/state', (req, res) => {
  const body = req.body || {};
  if (Object.prototype.hasOwnProperty.call(body, 'enabled')) {
    governance.setEnabled(!!body.enabled);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'url')) {
    governance.setUrl(body.url);
  }
  console.log(
    `[CLASPION] runtime override applied via /api/governance/state: ` +
    `enabled=${governance.enabled} url=${governance.url || '(none)'} ` +
    `effective=${governance.isEnabled()}`,
  );
  res.json(governance.getState());
});

// Convenience: flip the enabled flag.
router.post('/toggle', (req, res) => {
  const next = !governance.enabled;
  governance.setEnabled(next);
  console.log(`[CLASPION] toggled via UI: enabled=${next} effective=${governance.isEnabled()}`);
  res.json(governance.getState());
});

// Reset runtime overrides; fall back to env defaults.
router.post('/reset', (req, res) => {
  governance.resetOverrides();
  console.log('[CLASPION] runtime overrides reset; falling back to env defaults');
  res.json(governance.getState());
});

// Enhanced Governance Endpoints - Good Neighbor Guard Core Rules

// Get enhanced governance state (includes core rules status)
router.get('/enhanced/state', (req, res) => {
  const state = enhancedGovernance.getGovernanceState();
  res.json(state);
});

// Get Good Neighbor Guard Core Rules
router.get('/rules', (req, res) => {
  res.json(GOOD_NEIGHBOR_GUARD_RULES);
});

// Get specific rule details
router.get('/rules/:ruleNumber', (req, res) => {
  const ruleNumber = parseInt(req.params.ruleNumber);
  const rule = GOOD_NEIGHBOR_GUARD_RULES.rules[ruleNumber];

  if (!rule) {
    return res.status(404).json({
      error: 'Rule not found',
      message: `Rule ${ruleNumber} does not exist in Core Rules v${GOOD_NEIGHBOR_GUARD_RULES.version}`
    });
  }

  res.json({
    number: ruleNumber,
    version: GOOD_NEIGHBOR_GUARD_RULES.version,
    rule: rule
  });
});

// Test governance validation (for debugging)
router.post('/validate', async (req, res) => {
  try {
    const { action, context = {} } = req.body;

    if (!action) {
      return res.status(400).json({
        error: 'Missing action',
        message: 'Request body must include an "action" object'
      });
    }

    const result = await enhancedGovernance.validateAction(action, context);

    res.json({
      validation_result: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      error: 'Validation failed',
      message: error.message
    });
  }
});

// Get governance audit log (last 50 entries)
router.get('/audit', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const auditLog = enhancedGovernance.audit_log.slice(-limit).reverse();

  res.json({
    entries: auditLog,
    total_count: enhancedGovernance.audit_log.length,
    limit: limit
  });
});

// Exit quarantine mode (requires authorization)
router.post('/quarantine/exit', (req, res) => {
  const { auth_token } = req.body;

  if (!auth_token) {
    return res.status(400).json({
      error: 'Authorization required',
      message: 'auth_token is required to exit quarantine mode'
    });
  }

  try {
    const state = enhancedGovernance.exitQuarantine(auth_token);
    console.log('[GOVERNANCE] Quarantine mode exited via API');

    res.json({
      success: true,
      message: 'Quarantine mode exited',
      governance_state: state
    });

  } catch (error) {
    res.status(403).json({
      error: 'Authorization failed',
      message: 'Invalid auth_token or insufficient permissions'
    });
  }
});

// Health check for governance system
router.get('/health', (req, res) => {
  const basicState = governance.getState();
  const enhancedState = enhancedGovernance.getGovernanceState();

  res.json({
    status: 'healthy',
    claspion_basic: {
      enabled: basicState.enabled,
      has_url: basicState.has_url,
      has_api_key: basicState.has_api_key
    },
    enhanced_governance: {
      rules_version: enhancedState.rules_version,
      core_rules_count: enhancedState.core_rules_count,
      enforcement_layers: enhancedState.enforcement_layers.length,
      quarantine_mode: enhancedState.quarantine_mode,
      audit_entries: enhancedState.audit_entries
    },
    good_neighbor_guard: {
      version: GOOD_NEIGHBOR_GUARD_RULES.version,
      hierarchy_level: GOOD_NEIGHBOR_GUARD_RULES.hierarchy_level,
      enforced_by: GOOD_NEIGHBOR_GUARD_RULES.enforced_by,
      total_rules: Object.keys(GOOD_NEIGHBOR_GUARD_RULES.rules).length
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
