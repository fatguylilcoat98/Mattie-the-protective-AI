/*
  Audit log append-only invariant.

  The core append-only assertions are already in rls-matrix.test.js
  (because they need the role harness). This file extends them with
  the slower / less common cases.
*/

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

test('migration role can UPDATE audit log (escape hatch is gated)', (t) => {
  t.skip('TODO PR E: synthetic schema must define the one-off migration role');
  // Required behavior:
  //  - The synthetic schema defines a role with explicit UPDATE permission on the audit log.
  //  - That role is not exposed to application code.
  //  - The test confirms the escape hatch exists for schema corrections only.
  assert.ok(true, 'placeholder');
});

test('audit log retention worker can DELETE rows older than 7 years', (t) => {
  t.skip('TODO PR E + later: retention worker shipping');
  // Required behavior:
  //  - Insert a row dated 7 years + 1 day ago.
  //  - The retention worker (lylo_system role) can DELETE that row.
  //  - A row dated 6 years + 364 days ago cannot be deleted.
  assert.ok(true, 'placeholder');
});

test('audit log write failures fail-close the originating action', (t) => {
  t.skip('TODO PR D + PR E: write-failure injection scenario');
  // Required behavior:
  //  - Force an audit-log write to fail (e.g. by revoking the role's INSERT temporarily).
  //  - The originating memory write must also fail / roll back.
  //  - The senior must see a clear error, not a partial commit.
  assert.ok(true, 'placeholder');
});
