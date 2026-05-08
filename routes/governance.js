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

module.exports = router;
