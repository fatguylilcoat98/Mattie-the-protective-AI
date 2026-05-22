'use strict';
/*
 * Baseline CI scaffold -- forbidden cross-domain query detection.
 *
 * Contract: governed-context assembly and every read path must stay
 * within the requesting subject's domain. Queries that cross domain
 * boundaries (subject, pilot_instance, vault) are forbidden and must
 * be rejected, not silently filtered.
 *
 * Authoritative contract: PR #20 (PR-E-tests v2). Scaffold defers to it.
 *
 * SCAFFOLD ONLY -- skipped; bodies throw if un-skipped.
 */

const { test } = require('node:test');

const PENDING = 'scaffold -- cross-domain query contract owned by PR #20 (PR-E)';

test('a query spanning two pilot_instances is rejected', { skip: PENDING }, () => {
  throw new Error('not implemented');
});

test('governed context excludes rows outside the subject domain', { skip: PENDING }, () => {
  throw new Error('not implemented');
});

test('password_locked rows are excluded until unlocked', { skip: PENDING }, () => {
  throw new Error('not implemented');
});
