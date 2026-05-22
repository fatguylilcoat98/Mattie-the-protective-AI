#!/usr/bin/env node
'use strict';
/*
 * Baseline CI guard -- forbidden archive execution detection.
 *
 * db/migrations/_archive/ holds historical SQL that, per
 * db/migrations/README.md, is "never executed". This guard scans
 * executable command surfaces for references into that directory.
 *
 * Surfaces scanned:
 *   - package.json "scripts" values
 *   - *.ps1 and *.sh files
 *   - render.yaml
 *   - .github/workflows/*.yml
 * Surfaces intentionally NOT scanned: docs/** (may discuss the archive),
 * the archive itself, and this guard's own baseline file.
 *
 * Behaviour:
 *   - A reference recorded in the baseline allowlist is reported as a
 *     WARNING (known, tracked debt) and does not fail the build.
 *   - Any reference NOT in the baseline fails the build.
 * Emptying the baseline is a prerequisite for enforcement mode
 * (see docs/readiness/baseline-ci-plan.md).
 */

const fs = require('fs');
const path = require('path');

const REPO = process.cwd();
const BASELINE_PATH = '.github/ci-baseline/archive-execution-allowlist.json';
const ARCHIVE_RE = /db\/migrations\/_archive\/[^\s'"\\]*/g;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(REPO, full).split(path.sep).join('/');
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      if (rel === 'db/migrations/_archive') continue;
      if (rel === 'docs') continue;
      walk(full, out);
    } else {
      out.push(rel);
    }
  }
}

function refsIn(text) {
  return [...new Set(text.match(ARCHIVE_RE) || [])];
}

const violations = [];

// package.json script values
if (fs.existsSync(path.join(REPO, 'package.json'))) {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
    for (const ref of refsIn(String(cmd))) {
      violations.push({ surface: 'package.json', id: `scripts.${name}`, reference: ref });
    }
  }
}

// file surfaces
const files = [];
walk(REPO, files);
for (const rel of files) {
  if (rel === BASELINE_PATH) continue;
  const isPs = rel.endsWith('.ps1');
  const isSh = rel.endsWith('.sh');
  const isRender = rel === 'render.yaml';
  const isWorkflow = rel.startsWith('.github/workflows/') && /\.ya?ml$/.test(rel);
  if (!(isPs || isSh || isRender || isWorkflow)) continue;
  const text = fs.readFileSync(path.join(REPO, rel), 'utf8');
  for (const ref of refsIn(text)) {
    violations.push({ surface: rel, id: rel, reference: ref });
  }
}

// dedupe by surface + reference
const seen = new Set();
const unique = [];
for (const v of violations) {
  const key = v.surface + '|' + v.reference;
  if (seen.has(key)) continue;
  seen.add(key);
  unique.push(v);
}

// load baseline allowlist
let baseline = { entries: [] };
if (fs.existsSync(path.join(REPO, BASELINE_PATH))) {
  baseline = JSON.parse(fs.readFileSync(path.join(REPO, BASELINE_PATH), 'utf8'));
}
const baselineKeys = new Set((baseline.entries || []).map((e) => e.surface + '|' + e.reference));

const known = [];
const fresh = [];
for (const v of unique) {
  if (baselineKeys.has(v.surface + '|' + v.reference)) known.push(v);
  else fresh.push(v);
}

const uniqueKeys = new Set(unique.map((v) => v.surface + '|' + v.reference));
const stale = (baseline.entries || []).filter(
  (e) => !uniqueKeys.has(e.surface + '|' + e.reference)
);

console.log('Baseline CI -- forbidden archive execution detection');
console.log('----------------------------------------------------');
console.log(`Total references found: ${unique.length}`);
console.log(`  baselined (known debt): ${known.length}`);
console.log(`  new (not baselined):    ${fresh.length}`);
console.log('');

if (known.length) {
  console.log('WARNING -- known, baselined references into db/migrations/_archive/:');
  for (const v of known) console.log(`  - ${v.surface} [${v.id}] -> ${v.reference}`);
  console.log('  Tracked debt. Emptying the baseline is required for enforcement');
  console.log('  mode (docs/readiness/baseline-ci-plan.md).');
  console.log('');
}

if (stale.length) {
  console.log('NOTE -- baseline entries no longer found (safe to remove from baseline):');
  for (const e of stale) console.log(`  - ${e.surface} -> ${e.reference}`);
  console.log('');
}

if (fresh.length) {
  console.log('FAIL -- new references into db/migrations/_archive/ are not allowed:');
  for (const v of fresh) console.log(`  - ${v.surface} [${v.id}] -> ${v.reference}`);
  console.log('');
  console.log('Archived SQL must never be executed. Remove the reference, or, if the');
  console.log('SQL is still needed, promote it to a numbered migration under');
  console.log('db/migrations/ via the process in db/migrations/README.md.');
  process.exit(1);
}

console.log('OK -- no new executable references into the migration archive.');
