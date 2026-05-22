'use strict';
/*
 * Baseline CI scaffold -- cross-subject isolation.
 *
 * Contract: a subject (user) bound to one pilot_instance can never
 * read another subject's memories, profiles, or audit rows. Isolation
 * is enforced at the database row level (RLS).
 *
 * The authoritative RLS matrix is PR #20 (PR-E-tests v2). This scaffold
 * is a placeholder runner slot; when PR #20 merges, its matrix is the
 * source of truth and this file defers to it.
 *
 * SCAFFOLD ONLY -- skipped; bodies throw if un-skipped.
 */

const { test } = require('node:test');

const PENDING = 'scaffold -- RLS contract owned by PR #20 (PR-E); implement with PR-E';

test('a subject cannot read another subject memories', { skip: PENDING }, () => {
  throw new Error('not implemented');
});

test('a subject cannot read another pilot_instance rows', { skip: PENDING }, () => {
  throw new Error('not implemented');
});
