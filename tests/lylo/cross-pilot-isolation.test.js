/*
  Cross-pilot isolation.

  A pilot A user must not be able to see any row scoped to pilot B,
  regardless of role or visibility. Two paths to test:
   1. RLS at the memory_store level (default-deny via
      pilot_instance_id).
   2. Pinecone namespacing per pilot (out of scope for the synthetic
      tests; covered by PR G's tooling tests).
*/

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { connectOrSkip } = require('./fixtures/test-harness');
const { withRole } = require('./fixtures/role-clients');
const { seed } = require('./fixtures/synthetic-data');

test('pilot A senior cannot see any pilot B row, regardless of visibility', async (t) => {
  const conn = await connectOrSkip();
  if (conn.skip) {
    t.skip(`Skipped: ${conn.reason}`);
    return;
  }
  const { client, teardown } = conn;
  t.after(teardown);

  const ids = await seed(client);

  // TODO PR E + PR G: the synthetic schema's RLS policies do NOT yet
  // filter on pilot_instance_id (the matrix tests only use one pilot).
  // Once PR E adds the policy clause `pilot_instance_id = current_app_pilot_instance_id()`,
  // this test asserts that the senior of pilot A cannot read pilot B's rows.
  // For now this test is a placeholder to lock in the contract.
  t.skip('TODO PR E: add pilot_instance_id to RLS policies and re-enable this test');

  const seenFromA = await withRole(
    client,
    { role: 'senior', userId: ids.users.a.senior },
    async (c) => {
      const r = await c.query(
        `SELECT count(*)::int AS n FROM lylo_test.memory_store WHERE pilot_instance_id = $1`,
        [ids.pilots.b]
      );
      return r.rows[0].n;
    }
  );
  assert.equal(seenFromA, 0, 'pilot A senior must not see pilot B rows');
});
